import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import type {
  API,
  CameraController,
  CameraStreamingDelegate,
  Logging,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  SnapshotRequest,
  SnapshotRequestCallback,
  StartStreamRequest,
  StreamingRequest,
  StreamRequestCallback,
} from 'homebridge';
import { SRTPCryptoSuites, StreamRequestTypes } from 'homebridge';

interface PendingSession {
  address: string;
  videoPort: number;
  localVideoPort: number;
  videoCryptoSuite: SRTPCryptoSuites;
  videoSRTP: Buffer;
  videoSSRC: number;
}

interface OngoingSession {
  localVideoPort: number;
  process: ChildProcessWithoutNullStreams;
}

// Indexed by HAP's H264Profile/H264Level enum values (0, 1, 2).
const H264_PROFILE_NAMES = ['baseline', 'main', 'high'];
const H264_LEVEL_NAMES = ['3.1', '3.2', '4.0'];

export class CGDCameraStreamingDelegate implements CameraStreamingDelegate {
  // Set by the platform right after constructing the CameraController, so a
  // crashed ffmpeg process can tell HAP to tear down the session it broke.
  public controller?: CameraController;

  private readonly usedPorts = new Set<number>();
  private readonly pendingSessions = new Map<string, PendingSession>();
  private readonly ongoingSessions = new Map<string, OngoingSession>();

  constructor(
    private readonly log: Logging,
    private readonly api: API,
    private readonly videoSourceUrl: string,
    private readonly videoProcessor: string,
  ) {}

  private allocatePort = (): number => {
    for (let port = 5011; ; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
  };

  public handleSnapshotRequest = (request: SnapshotRequest, callback: SnapshotRequestCallback): void => {
    const args = [
      '-i', this.videoSourceUrl,
      '-frames:v', '1',
      '-vf', `scale=${request.width}:${request.height}`,
      '-f', 'mjpeg',
      'pipe:1',
    ];

    const ffmpeg = spawn(this.videoProcessor, args, { env: process.env });
    const chunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (data: Buffer) => this.log.debug(`[Camera Snapshot] ${data.toString('utf8')}`));

    ffmpeg.on('error', (error) => {
      this.log.error(`[Camera Snapshot] Failed to start ffmpeg: ${error.message}`);
      callback(error);
    });

    ffmpeg.on('exit', (code, signal) => {
      if (signal) {
        callback(new Error(`Snapshot process was killed with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        callback(new Error(`Snapshot process exited with code ${code}`));
        return;
      }

      callback(undefined, Buffer.concat(chunks));
    });
  };

  public prepareStream = (request: PrepareStreamRequest, callback: PrepareStreamCallback): void => {
    const localVideoPort = this.allocatePort();
    const videoSSRC = this.api.hap.CameraController.generateSynchronisationSource();

    this.pendingSessions.set(request.sessionID, {
      address: request.targetAddress,
      videoPort: request.video.port,
      localVideoPort,
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
      videoSSRC,
    });

    const response: PrepareStreamResponse = {
      video: {
        port: localVideoPort,
        ssrc: videoSSRC,
        srtp_key: request.video.srtp_key,
        srtp_salt: request.video.srtp_salt,
      },
    };

    callback(undefined, response);
  };

  public handleStreamRequest = (request: StreamingRequest, callback: StreamRequestCallback): void => {
    switch (request.type) {
      case StreamRequestTypes.START:
        this.startStream(request, callback);
        break;
      case StreamRequestTypes.RECONFIGURE:
        this.log.debug('[Camera Stream] Ignoring unsupported reconfigure request');
        callback();
        break;
      case StreamRequestTypes.STOP:
        this.stopStream(request.sessionID);
        callback();
        break;
    }
  };

  private startStream = (request: StartStreamRequest, callback: StreamRequestCallback): void => {
    const session = this.pendingSessions.get(request.sessionID);
    if (!session) {
      callback(new Error(`No pending session for ${request.sessionID}`));
      return;
    }

    const { video } = request;
    const profile = H264_PROFILE_NAMES[video.profile];
    const level = H264_LEVEL_NAMES[video.level];

    const args = [
      // The device's MJPEG-over-HTTP source carries no reliable timestamps,
      // so ffmpeg's frame-rate conform (the -r below) has nothing sane to pace
      // against and silently drops every single frame. Synthesize PTS from
      // wall-clock arrival time instead.
      '-use_wallclock_as_timestamps', '1',
      '-i', this.videoSourceUrl,
      '-map', '0:v',
      '-an', '-sn', '-dn',
      '-c:v', 'libx264',
      // x264's default lookahead/rate-control buffers several frames before
      // emitting anything, which reads as total silence on a live RTP stream.
      // zerolatency + ultrafast disables that buffering for real-time output.
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-r', `${video.fps}`,
      '-vf', `scale=${video.width}:${video.height}`,
      '-b:v', `${video.max_bit_rate}k`,
      '-bufsize', `${video.max_bit_rate * 2}k`,
      '-maxrate', `${video.max_bit_rate}k`,
      '-profile:v', profile,
      '-level:v', level,
      '-payload_type', `${video.pt}`,
      '-ssrc', `${session.videoSSRC}`,
      '-f', 'rtp',
    ];

    const usingSrtp = session.videoCryptoSuite !== SRTPCryptoSuites.NONE;
    if (usingSrtp) {
      args.push(
        '-srtp_out_suite',
        session.videoCryptoSuite === SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80
          ? 'AES_CM_256_HMAC_SHA1_80'
          : 'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params', session.videoSRTP.toString('base64'),
      );
    }

    args.push(
      `${usingSrtp ? 'srtp' : 'rtp'}://${session.address}:${session.videoPort}` +
      `?rtcpport=${session.videoPort}&localrtcpport=${session.localVideoPort}&pkt_size=${video.mtu}`,
    );

    this.log.debug(`[Camera Stream] Starting video stream (${video.width}x${video.height}, ${video.fps} fps, ${video.max_bit_rate} kbps)...`);

    const ffmpeg = spawn(this.videoProcessor, args, { env: process.env });
    let started = false;

    ffmpeg.stderr.on('data', (data: Buffer) => {
      this.log.debug(`[Camera Stream] ${data.toString('utf8')}`);

      if (!started) {
        started = true;
        callback();
      }
    });

    ffmpeg.on('error', (error) => {
      this.log.error(`[Camera Stream] Failed to start video stream: ${error.message}`);
      if (!started) {
        callback(error);
      }
    });

    ffmpeg.on('exit', (code, signal) => {
      this.usedPorts.delete(session.localVideoPort);

      if (code === null || code === 255) {
        this.log.debug('[Camera Stream] ffmpeg exited (stream stopped)');
        return;
      }

      this.log.error(`[Camera Stream] ffmpeg exited unexpectedly with code ${code}, signal ${signal}`);
      if (!started) {
        callback(new Error(`ffmpeg exited with code ${code}`));
      } else {
        this.controller?.forceStopStreamingSession(request.sessionID);
      }
    });

    this.ongoingSessions.set(request.sessionID, { localVideoPort: session.localVideoPort, process: ffmpeg });
    this.pendingSessions.delete(request.sessionID);
  };

  private stopStream = (sessionID: string): void => {
    const session = this.ongoingSessions.get(sessionID);
    if (!session) {
      return;
    }

    this.usedPorts.delete(session.localVideoPort);

    try {
      session.process.kill('SIGKILL');
    } catch (error) {
      this.log.warn(`[Camera Stream] Error terminating ffmpeg process: ${error}`);
    }

    this.ongoingSessions.delete(sessionID);
    this.log.debug('[Camera Stream] Stopped streaming session');
  };
}

# CGD garage door: app findings and enhancement ideas

Door IP: 192.168.0.8. Source: CenturionGarageDoors 1.47 APK and the plugin in this repo (v1.5.3).

## What the APK actually contains

The app is a thin wrapper. It holds no local API code and no firmware.

| Finding | Detail |
|---|---|
| Main UI | A WebView of `https://iot2superlift.krazyivan.net/iot/superlift/?app=android`. The screens live on the vendor's cloud, not in the app. |
| Push notifications | Handled through the same cloud (`.../push/?psh=`). |
| Bluetooth (BLE) | Scan, connect and descriptor writes, plus `wifi_scan` and QR scanning. This is used for first-time Wi-Fi setup of the door. |
| `local.html` | Only a "checking connection" splash. It polls the cloud URL every 10 s and shows "Internet connection problem!". |
| Permissions | Bluetooth, location, camera, Wi-Fi state. Nothing relating to a local control API. |

Conclusions:

- The Local API (`/api?key=...`) is served by the door's own firmware. The app can't tell us how it behaves.
- The door also talks out to the vendor cloud. A flaky Wi-Fi link or router can hurt both paths.
- I can't inspect or change the firmware from the APK. I also didn't contact 192.168.0.8, because this session can't reach your LAN.

## Plugin enhancements (I can build these)

Status JSON already returns fields the plugin ignores: `wdBm` (Wi-Fi signal), `cycles`, `dt`, `camera`, `status`.

1. **Adaptive polling.** The plugin polls every 5 s forever, even when the door is unreachable or idle. The code comments say the device only handles one connection at a time. Suggested pattern:
   - 1 to 2 s while the door is Opening or Closing.
   - 10 to 15 s when idle.
   - Exponential backoff (up to 60 s) after consecutive failures, so a struggling door isn't hammered.
2. **Log `wdBm` and `cycles`.** Warn when signal is weak (for example below -75 dBm). Log the signal on every failed poll so you can see whether dropouts line up with weak Wi-Fi. `cycles` could be exposed as a custom characteristic or just logged.
3. **Try `Connection: close`.** Node's fetch keeps sockets alive. Small embedded web servers often hang on stale keep-alive connections. Sending `Connection: close` (or a fresh dispatcher per request) is cheap to test and may fix "door stopped responding until power cycled" symptoms. This is a hypothesis to test, not a confirmed cause.
4. **Map the `error` field.** The plugin only checks non-zero. Log every distinct code and its context, then map known codes to HomeKit `ObstructionDetected` or a clearer log message once you know what they mean.
5. **Health summary.** One log line every few minutes: success rate, average latency, last error. Makes it easy to judge whether any change helped.
6. **Unreachable-device behaviour.** After N failed polls, report `SERVICE_COMMUNICATION_FAILURE` (No Response) in HomeKit rather than a stale state. Currently the last known state is kept indefinitely.

## Door and network side (no firmware changes)

I can't recommend flashing anything. The firmware is closed and vendor-signed. These steps are safe:

- **Fixed address.** Add a DHCP reservation for 192.168.0.8 on the router, so the IP never changes.
- **2.4 GHz only.** Put the door on a 2.4 GHz SSID. Disable band steering and any "smart connect" for that SSID.
- **Signal.** Aim for better than -70 dBm (read `wdBm`). A cheap access point or mesh node near the garage often fixes more than anything else.
- **Router quirks.** Turn off Wi-Fi power-save or aggressive client isolation on that SSID. Fix the channel (1, 6 or 11) rather than auto.
- **Separate IoT VLAN or SSID.** Reduces broadcast noise. Keep Homebridge able to reach it.
- **Security.** The key travels in the URL over plain HTTP. Keep the door off any guest or shared network and don't expose port 80 or 88 externally.
- **Firmware.** Ask CGD or Centurion support which firmware version you have and whether an OTA update exists. Mention the stuck "Opening/Closing" status.

## Quick diagnostic from your Mac

Run this for a few minutes, with your real key. It shows latency, failures and signal:

```sh
KEY='YOUR_LOCAL_KEY'
while true; do
  curl -s -m 5 -o /tmp/cgd.json -w '%{time_total}s http=%{http_code}\n' "http://192.168.0.8/api?key=$KEY&status=json" \
    && jq -c '{door,error,wdBm,cycles,dt}' /tmp/cgd.json
  sleep 5
done
```

If you paste a sample of the JSON (remove the key), I can say what `dt` and `error` mean.

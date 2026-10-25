import { test } from 'node:test';
import assert from 'node:assert/strict';
import parseDoorState, { DoorState } from '../../src/parseDoorState.js';

test('parseDoorState maps device strings by prefix', () => {
  assert.equal(parseDoorState('Closed'), DoorState.Closed);
  assert.equal(parseDoorState('Closed (obstruction)'), DoorState.Closed);
  assert.equal(parseDoorState('Opened'), DoorState.Opened);
  assert.equal(parseDoorState('Closing'), DoorState.Closing);
  assert.equal(parseDoorState('Opening'), DoorState.Opening);
  assert.equal(parseDoorState('Stopped'), DoorState.Stopped);
});

test('parseDoorState treats missing or unrecognised values as Error', () => {
  assert.equal(parseDoorState(undefined), DoorState.Error);
  assert.equal(parseDoorState(''), DoorState.Error);
  assert.equal(parseDoorState('Mystery'), DoorState.Error);
});

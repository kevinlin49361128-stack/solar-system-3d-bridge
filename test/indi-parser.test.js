// node --test test/indi-parser.test.js
//
// Smoke tests for the INDI XML parser embedded in IndiClient. We
// don't actually open a TCP socket — we just feed _onData() the
// kind of XML fragments a real indiserver streams and assert that
// the client emits the right 'pointing' events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndiClient } from '../src/indi/client.js';

function makeClient() {
  const c = new IndiClient();
  const events = [];
  c.on('pointing', (p) => events.push(p));
  return { c, events };
}

test('parses a single defNumberVector with RA + DEC', () => {
  const { c, events } = makeClient();
  c._onData(Buffer.from(`
    <defNumberVector device="Telescope Simulator" name="EQUATORIAL_EOD_COORD" state="Ok" perm="rw">
      <defNumber name="RA"  format="%010.6m">5.587000</defNumber>
      <defNumber name="DEC" format="%010.6m">-5.391000</defNumber>
    </defNumberVector>
  `));
  assert.equal(events.length, 1);
  assert.equal(events[0].raHours, 5.587);
  assert.equal(events[0].decDeg, -5.391);
  assert.equal(c.device, 'Telescope Simulator');
  assert.equal(c.gotInitialPointing, true);
});

test('parses subsequent setNumberVector updates', () => {
  const { c, events } = makeClient();
  c._onData(Buffer.from(`
    <defNumberVector device="iEQ45" name="EQUATORIAL_EOD_COORD">
      <defNumber name="RA">0</defNumber><defNumber name="DEC">0</defNumber>
    </defNumberVector>
  `));
  c._onData(Buffer.from(`
    <setNumberVector device="iEQ45" name="EQUATORIAL_EOD_COORD" state="Ok">
      <oneNumber name="RA">12.345</oneNumber>
      <oneNumber name="DEC">45.678</oneNumber>
    </setNumberVector>
  `));
  assert.equal(events.length, 2);
  assert.equal(events[1].raHours, 12.345);
  assert.equal(events[1].decDeg, 45.678);
});

test('ignores other devices once one is locked in', () => {
  const { c, events } = makeClient();
  c._onData(Buffer.from(`
    <defNumberVector device="iEQ45" name="EQUATORIAL_EOD_COORD">
      <defNumber name="RA">1</defNumber><defNumber name="DEC">2</defNumber>
    </defNumberVector>
  `));
  c._onData(Buffer.from(`
    <setNumberVector device="Some Other Camera" name="EQUATORIAL_EOD_COORD">
      <oneNumber name="RA">99</oneNumber><oneNumber name="DEC">99</oneNumber>
    </setNumberVector>
  `));
  assert.equal(events.length, 1);
  assert.equal(events[0].raHours, 1);
});

test('handles split-chunk data (TCP fragment boundaries)', () => {
  const { c, events } = makeClient();
  c._onData(Buffer.from('<defNumberVector device="iEQ45" name="EQUATORI'));
  c._onData(Buffer.from('AL_EOD_COORD"><defNumber name="RA">5.5</defNumber>'));
  c._onData(Buffer.from('<defNumber name="DEC">-3.2</defNumber></defNumberVector>'));
  assert.equal(events.length, 1);
  assert.equal(events[0].raHours, 5.5);
  assert.equal(events[0].decDeg, -3.2);
});

test('ignores unrelated property vectors', () => {
  const { c, events } = makeClient();
  c._onData(Buffer.from(`
    <defNumberVector device="iEQ45" name="GEOGRAPHIC_COORD">
      <defNumber name="LAT">25.0</defNumber><defNumber name="LONG">121.5</defNumber>
    </defNumberVector>
  `));
  assert.equal(events.length, 0);
  assert.equal(c.gotInitialPointing, false);
});

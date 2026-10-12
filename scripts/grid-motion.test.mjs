import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECELERATION,
  flingAt,
  planFling,
  rubberBandSlope,
} from '../src/canvasGrid/gridMotion.ts';

const column = 55;
const minimum = -30 * column;
const maximum = 36_600 * column;

// Samples a fling at 120 Hz until it reports arrival.
function run(fling, step = 1000 / 120) {
  const positions = [];
  let settledAt;
  for (let t = 0; t < 20_000; t += step) {
    const [x, done, settled] = flingAt(fling, t);
    positions.push(x);
    if (settled) settledAt ??= t;
    if (done) {
      assert.ok(settledAt !== undefined, 'settles before or on arrival');
      return { positions, end: x, duration: t, settledAt };
    }
  }
  assert.fail('fling never arrived');
}

function initialSpeed(fling) {
  const h = 0.01;
  return (flingAt(fling, h)[0] - flingAt(fling, 0)[0]) / h;
}

test('flings end exactly on a column and inside the limits', () => {
  for (const start of [0, 13, 27.5, 41, 550, 1234.5, minimum, maximum])
    for (const velocity of [-9000, -2500, -600, -80, 0, 80, 600, 2500, 9000]) {
      const fling = planFling(start, velocity, column, minimum, maximum);
      const { end, positions } = run(fling);
      assert.equal(
        end,
        Math.round(end / column) * column,
        `${start} ${velocity}`,
      );
      assert.ok(end >= minimum && end <= maximum);
      // No jump on the final frame: the previous frame was already there.
      const last = positions.at(-2) ?? end;
      assert.ok(Math.abs(last - end) < 0.5, `final step ${last - end}`);
    }
});

test('a fling keeps the release velocity and lands near its natural projection', () => {
  const tau = -1 / Math.log(DECELERATION);
  for (const velocity of [-3000, -1200, 900, 2000, 5000]) {
    const start = 2000 + 17;
    const fling = planFling(start, velocity, column, minimum, maximum);
    assert.ok(
      Math.abs(initialSpeed(fling) - velocity / 1000) < 0.01,
      `continuous at ${velocity}`,
    );
    const { end, positions } = run(fling);
    const natural = start + (velocity / 1000) * tau;
    assert.ok(Math.abs(end - natural) <= column / 2 + 1e-9);
    // Monotonic: decelerates into the column without reversing.
    for (let i = 1; i < positions.length; i++)
      assert.ok((positions[i] - positions[i - 1]) * velocity >= -1e-9);
  }
});

test('flings into an edge bounce back onto it; slow releases settle cleanly', () => {
  const into = planFling(minimum + 110, -6000, column, minimum, maximum);
  const bounced = run(into);
  assert.equal(bounced.end, minimum);
  const overshoot = minimum - Math.min(...bounced.positions);
  assert.ok(overshoot > 5 && overshoot <= 80, `overshoot ${overshoot}`);

  // At Today with nothing unlocked, a future fling bounces in place.
  const atToday = run(planFling(0, -3000, column, 0, maximum));
  assert.equal(atToday.end, 0);
  assert.ok(Math.min(...atToday.positions) < 0);

  // A stopped scroll between columns settles on the nearest without overshoot.
  for (const start of [20, 30]) {
    const { end, positions } = run(planFling(start, 0, column, 0, maximum));
    assert.equal(end, start < 27.5 ? 0 : 55);
    for (const x of positions) assert.ok(x >= 0 && x <= 55);
  }

  // Released in the rubber band: spring back without crossing into content.
  const back = run(planFling(-40, 2000, column, 0, maximum));
  assert.equal(back.end, 0);
  assert.ok(Math.max(...back.positions) <= 1e-9);
});

test('rubber band slope slows content the further it is pulled', () => {
  assert.equal(rubberBandSlope(0, 220), 1);
  assert.ok(rubberBandSlope(10, 220) < 0.55);
  assert.ok(rubberBandSlope(200, 220) < rubberBandSlope(20, 220));
});

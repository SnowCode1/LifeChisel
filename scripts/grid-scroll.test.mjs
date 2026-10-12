import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as navigation from '../src/gridNavigation.ts';
const source = ts.transpileModule(
  readFileSync(new URL('../src/useGridScroll.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function fixture(overrides = {}) {
  const calls = [],
    settles = [],
    reveals = [],
    haptics = [];
  const reactions = [];
  let identifier = 0;
  const module = { exports: {} };
  const animated = {
    cancelAnimation: () => {},
    Easing: { out: (value) => value, cubic: 'cubic' },
    ReduceMotion: { System: 'system' },
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    scrollTo: (ref, x, _y, animate) => calls.push({ ref: ref.id, x, animate }),
    useAnimatedRef: () => ({ id: ++identifier }),
    useAnimatedScrollHandler: (handlers) => handlers,
    useSharedValue: (initial) => ({
      value: initial,
      set(value) {
        this.value = value;
        for (const reaction of reactions) {
          const next = reaction.prepare();
          if (next !== reaction.previous) {
            reaction.previous = next;
            reaction.react(next);
          }
        }
      },
    }),
    useAnimatedReaction: (prepare, react) =>
      reactions.push({ prepare, react, previous: prepare() }),
    withTiming: (target, _config, finish) => {
      finish(true);
      return target;
    },
  };
  runInNewContext(
    source,
    {
      exports: module.exports,
      module,
      require: (name) => {
        if (name === 'react') return { useLayoutEffect: (effect) => effect() };
        if (name === 'react-native') return {};
        if (name === 'react-native-reanimated') return animated;
        if (name === './gridNavigation') return navigation;
        if (name === './haptics')
          return { feedback: (value) => haptics.push(value) };
        throw new Error(`Unknown import ${name}`);
      },
    },
    { timeout: 500 },
  );
  const hook = module.exports.useGridScroll({
    columnWidth: 55,
    visibleDays: 4,
    dayCount: 120,
    futureCount: 0,
    origin: 5000,
    onSettle: (day, finished) => settles.push([day, finished]),
    onReveal: (offset) => reveals.push(offset),
    ...overrides,
  });
  const event = (x, target = x) => ({
    contentOffset: { x },
    targetContentOffset: { x: target },
  });
  return { hook, calls, settles, reveals, haptics, event };
}
test('native geometry aligns both lists/fallback immediately and ignores premature mount offsets', () => {
  const f = fixture();
  f.hook.alignGeometry(1650, false);
  assert.equal(f.hook.offset.value, 1650);
  assert.equal(f.hook.geometryReady.value, false);
  assert.deepEqual(
    f.calls.slice(-2).map((c) => c.x),
    [1650, 1650],
  );
  f.hook.bodyScroll.onScroll(f.event(0));
  assert.equal(f.hook.offset.value, 1650);
  f.hook.alignGeometry(1650, true);
  assert.equal(f.hook.geometryReady.value, true);
  f.hook.bodyScroll.onScroll(f.event(1650));
  assert.equal(f.hook.offset.value, 1650);
  const landscape = fixture({ columnWidth: 48, visibleDays: 13 });
  landscape.hook.alignGeometry(30 * 48, false);
  landscape.hook.bodyScroll.onScroll(landscape.event(1650));
  assert.equal(landscape.hook.offset.value, 30 * 48);
});
test('only the native driver synchronizes the other list, with global dates and final-settle distinction', () => {
  const f = fixture();
  f.hook.bodyScroll.onBeginDrag();
  f.hook.bodyScroll.onScroll(f.event(2200));
  assert.equal(f.hook.offset.value, 2200);
  assert.equal(f.calls.at(-1).ref, 1);
  assert.equal(f.calls.at(-1).x, 2200);
  f.hook.headerScroll.onScroll(f.event(0));
  assert.equal(f.hook.offset.value, 2200);
  f.hook.bodyScroll.onEndDrag(f.event(2200, 2255));
  assert.deepEqual(f.settles.at(-1), [5041, false]);
  f.hook.bodyScroll.onMomentumEnd(f.event(2255));
  assert.deepEqual(f.settles.at(-1), [5041, true]);
  assert.equal(f.haptics.length, 0);
});
test('animated date navigation addresses a loaded window instead of lifetime offsets', () => {
  const f = fixture({ futureCount: 30, origin: -5000 });
  let arrived = 0;
  f.hook.scrollToDay(-4990, () => arrived++);
  assert.equal(arrived, 1);
  assert.equal(f.hook.offset.value, 40 * 55);
  assert.deepEqual(
    f.calls.slice(-2).map((c) => c.x),
    [40 * 55, 40 * 55],
  );
});
test('newer historical dates load without future resistance/haptics; deliberate future pulls retain the threshold', () => {
  const past = fixture();
  past.hook.bodyScroll.onBeginDrag();
  past.hook.bodyScroll.onScroll(past.event(-10));
  past.hook.bodyScroll.onEndDrag(past.event(-10));
  assert.deepEqual(past.reveals, [-10]);
  assert.equal(past.hook.pull.value, 0);
  assert.equal(past.haptics.length, 0);
  const future = fixture({ origin: -5000 });
  future.hook.bodyScroll.onBeginDrag();
  future.hook.bodyScroll.onScroll(future.event(-70));
  future.hook.bodyScroll.onEndDrag(future.event(-70));
  assert.deepEqual(future.reveals, [-70]);
  assert.deepEqual(future.haptics, ['boundary']);
});
test('Android holds ordinary scrolling at the preload boundary; pulls start there and navigation may cross it', () => {
  const f = fixture({
    dayCount: 90,
    futureCount: 120,
    origin: 0,
    lockedDays: 120,
  });
  const boundary = 120 * 55;
  f.hook.alignGeometry(boundary, true);
  f.hook.bodyScroll.onBeginDrag();
  f.hook.bodyScroll.onScroll(f.event(boundary + 300));
  assert.equal(f.hook.offset.value, boundary + 300);
  f.hook.bodyScroll.onScroll(f.event(boundary - 40));
  assert.equal(f.hook.offset.value, boundary);
  assert.deepEqual(
    f.calls.slice(-2).map((call) => call.x),
    [boundary, boundary],
  );
  f.hook.bodyScroll.onEndDrag(f.event(boundary - 40));
  assert.deepEqual(f.settles.at(-1), [0, true], 'settles on Today, not beyond');
  assert.equal(f.reveals.length, 0);
  assert.equal(f.hook.edgePull.begin(300, 400), true);
  f.hook.bodyScroll.onScroll(f.event(boundary + 200));
  assert.equal(f.hook.edgePull.begin(300, 400), false);
  f.hook.scrollToDay(-1, () => {});
  assert.equal(f.hook.offset.value, 119 * 55);
});
test('Android edge pulls decide before the list slop and fail for past-ward or vertical movement', () => {
  const { hook } = fixture({ origin: -5000 });
  assert.equal(hook.edgePull.begin(300, 400), true);
  assert.equal(hook.edgePull.move(297, 400), 'wait');
  assert.equal(hook.edgePull.move(294, 401), 'activate');
  assert.equal(hook.edgePull.move(310, 400), 'fail');
  assert.equal(hook.edgePull.move(298, 410), 'fail');
  hook.alignGeometry(550, true);
  assert.equal(hook.edgePull.begin(300, 400), false);
});
test('Android edge pulls share the threshold tick, streak and release reveal', () => {
  const short = fixture({ origin: -5000 });
  short.hook.edgePull.start();
  short.hook.edgePull.update(-60);
  assert.equal(short.hook.pull.value, 40);
  short.hook.edgePull.end(true);
  assert.deepEqual(short.reveals, []);
  assert.equal(short.hook.pull.value, 0);
  assert.equal(short.haptics.length, 0);
  const future = fixture({ origin: -5000 });
  future.hook.edgePull.start();
  future.hook.edgePull.update(-96);
  future.hook.edgePull.update(-600);
  assert.deepEqual(future.haptics, ['boundary']);
  future.hook.edgePull.end(true);
  // However long the pull, the unmoved columns continue by one: tomorrow.
  assert.deepEqual(future.reveals, [-55]);
  assert.equal(navigation.futureRevealDay(-55, 55, 0), -1);
  assert.equal(future.hook.pull.value, 0);
  const cancelled = fixture({ origin: -5000 });
  cancelled.hook.edgePull.start();
  cancelled.hook.edgePull.update(-120);
  cancelled.hook.edgePull.end(false);
  assert.deepEqual(cancelled.reveals, []);
  const past = fixture();
  past.hook.edgePull.start();
  past.hook.edgePull.update(-15);
  assert.equal(past.hook.pull.value, 0);
  past.hook.edgePull.end(true);
  assert.deepEqual(past.reveals, [-55]);
  assert.equal(past.haptics.length, 0);
});

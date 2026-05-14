import { buildConcatCrossfadePlan } from './ai-video-concat.service';

describe('AiVideoConcatService helpers', () => {
  it('builds sequential crossfade offsets for multi-segment videos', () => {
    const plan = buildConcatCrossfadePlan([5, 5, 5], 0.2);

    expect(plan).toEqual([
      {
        leftIndex: 0,
        rightIndex: 1,
        durationSeconds: 0.2,
        offsetSeconds: 4.8,
      },
      {
        leftIndex: 1,
        rightIndex: 2,
        durationSeconds: 0.2,
        offsetSeconds: 9.6,
      },
    ]);
  });

  it('disables crossfade when a segment is too short for a safe overlap', () => {
    expect(buildConcatCrossfadePlan([0.18, 5], 0.2)).toEqual([]);
  });
});

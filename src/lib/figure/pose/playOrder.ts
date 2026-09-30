/**
 * Keyframe indices the interactive viewer's Play loops through (top → bottom → drive → top).
 * Its own module so the viewer can import it without pulling in the solver.
 */
export const PLAY_ORDER: readonly number[] = [0, 1, 2, 0];

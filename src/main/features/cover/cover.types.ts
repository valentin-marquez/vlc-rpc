/**
 * What one attempt at showing the file's own artwork produced.
 *
 * The two negatives are not interchangeable. "no-artwork" is a fact about the
 * file and a later lookup elsewhere may fill the gap. "publish-failed" is a
 * fact about this attempt only: the file does have artwork, which beats
 * anything a catalog could supply, so the right answer is to try again on the
 * next poll rather than substitute someone else's cover.
 */
export type CoverOutcome =
	| { kind: "published"; url: string }
	| { kind: "no-artwork" }
	| { kind: "publish-failed" }

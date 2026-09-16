/**
 * Collaboration suffixes, in the shapes both the tags and the catalogs write
 * them. The bracketed form first: "(feat. X)", "[ft. X]", "(con X)".
 */
const BRACKETED_COLLABORATION =
	/\s*[([]\s*(?:featuring|feat|ft|con|with)\b\.?\s+([^)\]]+?)\s*[)\]]\s*$/i

/**
 * Unbracketed, only for the `feat.` family. "con" and "with" are ordinary words
 * in a title ("Bailando con Lobos"), and without brackets there is nothing to
 * tell a collaboration from a sentence.
 */
const TRAILING_COLLABORATION = /\s+(?:featuring|feat|ft)\b\.?\s+([^)\]]+?)\s*$/i

export interface Credit {
	title: string
	/**
	 * Kept as one name rather than split further: a credit like "feat. Earth,
	 * Wind & Fire" would come apart into three names that match nothing, and the
	 * scorer only needs the credit to have more than one entry.
	 */
	collaborators: string[]
}

/**
 * Moves the collaboration suffix off a title and into a credit.
 *
 * Shared by the iTunes normalizer and by the resolver's query builder, and that
 * sharing is the point: the identity gate compares the two titles, so stripping
 * "(feat. Rihanna)" from the candidate and not from the tag leaves the sides in
 * different shapes and refuses correct matches. Apple writes titles that way
 * itself, so the two sides meet constantly.
 *
 * It also keeps the scorer provider agnostic. iTunes leaves `artistName`
 * identical for the solo take and the collaboration and puts the difference in
 * `trackName`: "Probablemente" against "Probablemente (feat. David Bisbal)".
 * MusicBrainz encodes the same thing in the artist credit instead.
 */
export function splitCollaboration(title: string): Credit {
	const match = BRACKETED_COLLABORATION.exec(title) ?? TRAILING_COLLABORATION.exec(title)
	if (!match?.[1]) {
		return { title, collaborators: [] }
	}

	return {
		title: title.slice(0, match.index).trim(),
		collaborators: [match[1].trim()],
	}
}

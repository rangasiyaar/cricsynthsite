/** JSON for a <script type="application/ld+json"> block: "<" is escaped so text from match data (team names, previews)
 *  can never close the script tag early. */
export const ldJson = (x: unknown): string => JSON.stringify(x).replace(/</g, "\\u003c");

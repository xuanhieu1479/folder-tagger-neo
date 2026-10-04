import type { Database } from 'bun:sqlite';
import { getJson, setJson } from '../db/open';
import { emptyRelations, own, type Relations } from '../shared/types';

const RELATIONS_KEY = 'relations';

/** An author's usual tags are only worked out once they have this many folders of their own. */
export const MIN_AUTHOR_FOLDERS = 5;
/** A tag is "usual" for an author when it is on at least this share of their folders. */
export const USUAL_PERCENT = 51;

/**
 * An author's sample is the folders where they are the only author. A parody, genre or
 * category counts as usual when it appears on at least 51% of that sample.
 */
const AUTHOR_SQL = `
  WITH single AS (
    SELECT ft.folder_id, MIN(ft.tag_id) AS author_id
    FROM folder_tags ft JOIN tags t ON t.id = ft.tag_id
    WHERE t.type = 'author' GROUP BY ft.folder_id HAVING COUNT(*) = 1
  ),
  totals AS (
    SELECT author_id, COUNT(*) AS n FROM single GROUP BY author_id HAVING COUNT(*) >= ${MIN_AUTHOR_FOLDERS}
  )
  SELECT a.name AS parent, c.type AS type, c.name AS child
  FROM single s
  JOIN totals tot ON tot.author_id = s.author_id
  JOIN tags a ON a.id = s.author_id
  JOIN folder_tags ft ON ft.folder_id = s.folder_id
  JOIN tags c ON c.id = ft.tag_id AND c.type IN ('parody', 'genre', 'category')
  GROUP BY s.author_id, c.id
  HAVING COUNT(*) * 100 >= ${USUAL_PERCENT} * MAX(tot.n)
  ORDER BY a.name, COUNT(*) DESC, c.name`;

/** Characters seen with a parody, taken from folders that have exactly one parody. */
const PARODY_SQL = `
  WITH single AS (
    SELECT ft.folder_id, MIN(ft.tag_id) AS parody_id
    FROM folder_tags ft JOIN tags t ON t.id = ft.tag_id
    WHERE t.type = 'parody' GROUP BY ft.folder_id HAVING COUNT(*) = 1
  )
  SELECT p.name AS parent, c.name AS child, COUNT(*) AS count
  FROM single s
  JOIN tags p ON p.id = s.parody_id
  JOIN folder_tags ft ON ft.folder_id = s.folder_id
  JOIN tags c ON c.id = ft.tag_id AND c.type = 'character'
  GROUP BY s.parody_id, c.id
  ORDER BY p.name, COUNT(*) DESC, c.name`;

const push = (map: Record<string, string[]>, parent: string, child: string) =>
  (own(map, parent) ?? (map[parent] = [])).push(child);

/** Learns which tags go together from the whole library and stores the result. */
export function calculateRelations(db: Database): Relations {
  const relations = emptyRelations();

  const authorRows = db.query(AUTHOR_SQL).all() as {
    parent: string;
    type: 'parody' | 'genre' | 'category';
    child: string;
  }[];
  for (const row of authorRows) push(relations[`author_${row.type}`], row.parent, row.child);

  const parodyRows = db.query(PARODY_SQL).all() as { parent: string; child: string; count: number }[];
  const best = new Map<string, number>();
  for (const row of parodyRows) {
    push(relations.parody_character, row.parent, row.child);
    if (row.count > (best.get(row.child) ?? 0)) {
      best.set(row.child, row.count);
      relations.character_parody[row.child] = row.parent;
    }
  }

  setJson(db, RELATIONS_KEY, relations);
  return relations;
}

export const getRelations = (db: Database): Relations => ({
  ...emptyRelations(),
  ...getJson<Partial<Relations>>(db, RELATIONS_KEY, {}),
});

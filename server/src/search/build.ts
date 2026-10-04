import { normalizeTagName } from '../shared/normalize';
import type { Sort, TagType } from '../shared/types';
import type { Filter, ParsedQuery, Term } from './parse';

type Sql = { sql: string; params: string[] };

export type SearchOptions = {
  /** Only folders with this category tag. */
  category?: string;
  /** Only folders without any category tag. */
  noCategory?: boolean;
  sort: Sort;
};

export type BuiltSearch = { where: string; params: string[]; orderBy: string };

const ORDER_BY: Record<Sort, string> = {
  alpha: 'f.name_key, f.id',
  updated: 'f.updated_at DESC, f.id DESC',
  popular: 'f.open_count DESC, f.name_key, f.id',
  random: 'f.shuffle_key, f.id',
};

const hasTag = (condition: string) =>
  `EXISTS (SELECT 1 FROM folder_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.folder_id = f.id AND ${condition})`;

/** Tag names never contain punctuation, so the term is compared in its tag-name form. */
function tagCondition(term: Term): Sql | null {
  const text = normalizeTagName(term.text);
  if (!text) return null;
  if (term.exact) return { sql: 't.name = ?', params: [text] };
  if (term.whole) return { sql: 'instr(t.name_words, ?) > 0', params: [` ${text} `] };
  return { sql: 'instr(t.name, ?) > 0', params: [text] };
}

/** Folder names always match by substring; a quoted term is a phrase, not an exact name. */
function nameCondition(term: Term): Sql {
  if (term.whole) return { sql: 'instr(f.name_words, ?) > 0', params: [` ${term.text} `] };
  return { sql: 'instr(f.name_key, ?) > 0', params: [term.text] };
}

function termCondition(term: Term): Sql {
  const tag = tagCondition(term);
  let condition: Sql;
  if (term.field === 'name') condition = nameCondition(term);
  else if (term.field === 'any') {
    const name = nameCondition(term);
    condition = tag ? { sql: `(${name.sql} OR ${hasTag(tag.sql)})`, params: [...name.params, ...tag.params] } : name;
  } else
    condition = tag
      ? { sql: hasTag(`t.type = ? AND ${tag.sql}`), params: [term.field, ...tag.params] }
      : { sql: '0', params: [] };
  return term.exclude ? { sql: `NOT ${condition.sql}`, params: condition.params } : condition;
}

const ofType = (type: TagType): Sql => ({ sql: hasTag('t.type = ?'), params: [type] });

function filterCondition(filter: Filter): Sql {
  if (filter.kind === 'have') return ofType(filter.type);
  if (filter.kind === 'no') return { sql: `NOT ${ofType(filter.type).sql}`, params: [filter.type] };
  return {
    sql: '(SELECT COUNT(*) FROM folder_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.folder_id = f.id AND t.type = ?) > 1',
    params: [filter.type],
  };
}

/** Builds the WHERE and ORDER BY for `folders f`. Every term and filter must hold. */
export function buildSearch(query: ParsedQuery, options: SearchOptions): BuiltSearch {
  const conditions: Sql[] = [...query.terms.map(termCondition), ...query.filters.map(filterCondition)];
  if (options.noCategory) conditions.push(filterCondition({ kind: 'no', type: 'category' }));
  else if (options.category)
    conditions.push({ sql: hasTag("t.type = 'category' AND t.name = ?"), params: [options.category] });

  return {
    where: conditions.length ? conditions.map(c => c.sql).join(' AND ') : '1',
    params: conditions.flatMap(c => c.params),
    orderBy: ORDER_BY[options.sort],
  };
}

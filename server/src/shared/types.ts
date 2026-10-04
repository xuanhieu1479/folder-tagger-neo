export const TAG_TYPES = ['author', 'parody', 'character', 'genre', 'category'] as const;
export type TagType = (typeof TAG_TYPES)[number];
export type TagMap = Record<TagType, string[]>;

export const emptyTagMap = (): TagMap => ({ author: [], parody: [], character: [], genre: [], category: [] });

export const SORTS = ['alpha', 'updated', 'popular', 'random'] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** add: append the tags. edit: replace all tags (one folder only). remove: take the tags away. */
export const APPLY_MODES = ['add', 'edit', 'remove'] as const;
export type ApplyMode = (typeof APPLY_MODES)[number];

export const IMPORT_MODES = ['append', 'overwrite'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

/** Names this app in the health check and in export files. */
export const APP_ID = 'folder-tagger-neo';

export type TagCount = { type: TagType; name: string; count: number };

/** Which tags usually go together, learned from the library. Lists are ordered most likely first. */
export type Relations = {
  parody_character: Record<string, string[]>;
  author_parody: Record<string, string[]>;
  author_genre: Record<string, string[]>;
  author_category: Record<string, string[]>;
  /** The parody each character is most often seen with. */
  character_parody: Record<string, string>;
};

export const emptyRelations = (): Relations => ({
  parody_character: {},
  author_parody: {},
  author_genre: {},
  author_category: {},
  character_parody: {},
});

/**
 * Looks a tag name up in a plain object. A bare `map[name]` would find inherited
 * members for a tag named "constructor".
 */
export const own = <T>(map: Record<string, T>, name: string): T | undefined =>
  Object.hasOwn(map, name) ? map[name] : undefined;

export type Settings = {
  defaultSearch: string;
  randomAtStartup: boolean;
  pageSize: PageSize;
};

export const DEFAULT_SETTINGS: Settings = { defaultSearch: '', randomAtStartup: false, pageSize: 25 };

export type FolderItem = { id: number; name: string; path: string; thumbnail: string | null };

export type ExportFolder = {
  path: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  openCount: number;
  lastOpenedAt: number | null;
  tags: TagMap;
};

export type ExportFile = {
  app: typeof APP_ID;
  version: 1;
  exportedAt: number;
  folders: ExportFolder[];
};

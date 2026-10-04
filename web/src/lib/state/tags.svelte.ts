import { api, attempt, call } from '$lib/api';
import {
  DEFAULT_SETTINGS,
  emptyRelations,
  emptyTagMap,
  type Relations,
  type Settings,
  type TagCount,
  type TagMap,
} from '$server/shared/types';

/** Every tag in the library and what is known about which tags go together. */
class Tags {
  // Both are only ever replaced whole, so they need no deep reactivity.
  all = $state.raw<TagCount[]>([]);
  relations = $state.raw<Relations>(emptyRelations());

  /** Tag names per type, most used first: the starting order for suggestions. */
  byType: TagMap = $derived.by(() => {
    const names = emptyTagMap();
    for (const tag of this.all) names[tag.type].push(tag.name);
    return names;
  });

  /** Categories in use, for the header dropdown. */
  categories: string[] = $derived(
    this.all
      .filter(tag => tag.type === 'category' && tag.count > 0)
      .map(tag => tag.name)
      .sort(),
  );

  async load(): Promise<void> {
    this.all = (await attempt(() => call(api.tags.$get()))) ?? this.all;
  }

  async loadRelations(): Promise<void> {
    this.relations = (await attempt(() => call(api.relations.$get()))) ?? this.relations;
  }
}

export const tags = new Tags();

class SettingsStore {
  value = $state<Settings>({ ...DEFAULT_SETTINGS });

  async load(): Promise<void> {
    this.value = (await attempt(() => call(api.settings.$get()))) ?? this.value;
  }

  async save(changes: Partial<Settings>): Promise<boolean> {
    const saved = await attempt(() => call(api.settings.$put({ json: changes })));
    if (saved) this.value = saved;
    return saved !== undefined;
  }
}

export const settings = new SettingsStore();

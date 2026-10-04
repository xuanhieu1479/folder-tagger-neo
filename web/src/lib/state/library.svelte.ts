import { api, attempt, call } from '$lib/api';
import type { FolderItem, PageSize, Settings, Sort } from '$server/shared/types';

export const ALL_CATEGORIES = 'all';
export const NO_CATEGORY = 'none';
const CATEGORY_PREFIX = 'tag:';
export const categoryValue = (name: string) => `${CATEGORY_PREFIX}${name}`;

/** The folders on screen and the search, sort and page that produced them. */
class Library {
  /** The text in the search box. It takes effect on `search()`. */
  query = $state('');
  /** 'all', 'none', or 'tag:<category>'. */
  category = $state(ALL_CATEGORIES);
  sort = $state<Sort>('alpha');
  page = $state(1);
  size = $state<PageSize>(25);

  items = $state<FolderItem[]>([]);
  total = $state(0);
  pages = $state(1);
  /** Folder ids selected in the grid: the first is the Shift anchor, the last is the keyboard cursor. */
  selected = $state<number[]>([]);

  #applied = '';
  #request = 0;
  /** Called after every load, e.g. to scroll the grid back to the top. */
  onloaded: (() => void) | undefined;

  /** Reloads the current page with the search that is in effect. */
  async load(): Promise<void> {
    const request = ++this.#request;
    const query = {
      q: this.#applied,
      sort: this.sort,
      page: String(this.page),
      size: String(this.size),
      noCategory: this.category === NO_CATEGORY ? '1' : undefined,
      category: this.category.startsWith(CATEGORY_PREFIX) ? this.category.slice(CATEGORY_PREFIX.length) : undefined,
    };

    const result = await attempt(() => call(api.folders.$get({ query })));
    if (!result || request !== this.#request) return;
    this.items = result.items;
    this.total = result.total;
    this.pages = result.pages;
    this.page = result.page;
    const visible = new Set(result.items.map(folder => folder.id));
    this.selected = this.selected.filter(id => visible.has(id));
  }

  #fromFirstPage(): Promise<void> {
    return this.goto(1);
  }

  /** The first load of the app, as the settings ask for it. */
  start(settings: Settings): Promise<void> {
    this.size = settings.pageSize;
    this.query = settings.defaultSearch;
    this.#applied = this.query;
    return settings.randomAtStartup ? this.shuffle() : this.#fromFirstPage();
  }

  /** Applies the text in the search box. */
  search(): Promise<void> {
    this.#applied = this.query;
    return this.#fromFirstPage();
  }

  setCategory(category: string): Promise<void> {
    this.category = category;
    return this.#fromFirstPage();
  }

  setSort(sort: Sort): Promise<void> {
    this.sort = sort;
    return this.#fromFirstPage();
  }

  setSize(size: PageSize): Promise<void> {
    this.size = size;
    return this.#fromFirstPage();
  }

  async goto(page: number): Promise<void> {
    this.page = page;
    await this.load();
    this.onloaded?.();
  }

  /** Puts every folder in a new random order and shows it. */
  async shuffle(): Promise<void> {
    await attempt(() => call(api.folders.shuffle.$post()));
    this.sort = 'random';
    await this.#fromFirstPage();
  }

  /** Clears the search and shows the most recently changed folders first. */
  showNewest(): Promise<void> {
    this.query = '';
    this.#applied = '';
    this.category = ALL_CATEGORIES;
    this.sort = 'updated';
    return this.#fromFirstPage();
  }

  get selectedFolders(): FolderItem[] {
    return this.selected.flatMap(id => this.items.find(folder => folder.id === id) ?? []);
  }
}

export const library = new Library();

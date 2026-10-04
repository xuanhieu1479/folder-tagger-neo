# Handoff: folder-tagger-neo

You are picking up a rewrite of the user's personal app. This file is everything decided so far. Read it fully before doing anything.

## 1. What this is

**Folder Tagger** is a single-user, local-only Windows app. The user tags folders on disk (mostly manga, doujinshi, voice works, games and anime) and searches them by tag. The user wrote the original about 5–6 years ago, to learn Electron, and still uses it.

- **Old app (read-only reference):** `C:\Users\Admin\Desktop\folder-tagger-electron`. Electron 11, Express on `:8000`, TypeORM 0.2.29, better-sqlite3, React 17, Redux, Blueprint.js and webpack, about 6,800 lines of TypeScript. Never modify it.
- **New app:** `C:\Users\Admin\Desktop\folder-tagger-neo` (this folder). It contains an empty git repo on `main` with no commits, plus this file. Nothing has been scaffolded yet.

**Why rewrite and not upgrade:** almost every dependency needs a breaking migration. The Electron `remote` module has been removed, TypeORM 0.3 drops the global `getRepository`/`getManager` that all the logic uses, and node-sass and Forge 6 beta are dead. The native better-sqlite3 build needs Python 2.7 and VS2017, and there are no tests. Updating would touch every file anyway.

## 2. Ground rules from the user (non-negotiable)

- **Never write outside the current working folder** without explicit permission for that exact path. Reading anywhere is fine. Temporary files go only in the session scratchpad directory, not in `%TEMP%`, not in `os.tmpdir()`, and not in the user profile. Installing global tools (for example Bun) also writes outside the folder, so **ask first**.
- **Prove things before building on them.** The user said: "I do not want to setup everything and hear your 'sorry' later." When a plan relies on something uncertain, build a small, automated, real test first and report actual results (pass/fail output, timings, screenshots).
- **Light and fast.** There is one user, it's local, and it's never served anywhere. Choose minimal dependencies, fast startup and no heavyweight frameworks.
- Explain trade-offs plainly. The user knows React, Express and Electron, and asks "why is X better than the good old Y?" Answer honestly, including when the old option would be fine.

## 3. Decisions made

| Area | Decision | Notes |
|---|---|---|
| Runtime | **Bun** | Built-in TypeScript, `bun:sqlite`, `bun test` and bundler. No native compile step. **Bun is not installed yet** (only Node v22.12.0 is). The user has allowed installing it. |
| Server | **Hono** on Bun | Tiny, standards-based. Use Hono's typed RPC client (`hc`) so the frontend gets typed routes, replacing the old `common/variables/api.ts` constants and axios. |
| Database | **SQLite through `bun:sqlite`** | Raw SQL with prepared statements, plus a small migration runner based on `PRAGMA user_version`. No ORM. JSON stays as the export/backup format. |
| UI library | **shadcn-svelte + Tailwind v4** (decided by the user) | Copy-in components built on Bits UI. Useful pieces: Dialog, Command (palette, rename box), Context Menu, Combobox (tag input), Pagination, Sonner (toasts). |
| Frontend | **Svelte 5 + Vite**, single-page app | Plain Svelte, **not SvelteKit**. Runes (`$state`, `$props`); shared state goes in `.svelte.ts` modules (no Redux). The user understood Svelte is a component library, not a static site generator. |
| HTTP | Native `fetch` through Hono `hc` | No axios. |
| Utilities | Native JS | No lodash and no moment. Use `Intl`/`Date`, `Object.groupBy`, `Set` methods, `structuredClone`. Fall back to es-toolkit only if really needed. |
| Validation | Valibot (optional) | For import JSON and request bodies. |
| Tooling | TypeScript, Prettier with `prettier-plugin-svelte`, `svelte-check`, `bun test` | Skip ESLint at first. |
| How the app opens | Browser **app mode**: `msedge --app=http://127.0.0.1:<port>` | Gives a standalone window. Tauri remains a possible wrapper later, and the UI and API wouldn't change. |
| OS integration | Done by the **server** | Folder picker through PowerShell (proven, see §6), Explorer through `explorer.exe <path>`, folder rename, thumbnails, and image listing/streaming for the built-in reader. |

### Resolved questions
1. **Feature picks:** all decided; see §5.
2. **New features:** only the built-in reader (#8) for now.
3. **Installing Bun: allowed.** The user gave permission to install Bun. That permission covers Bun only; anything else outside the project folder still needs asking.
4. **Migrating old data: postponed** until the new app is done. Don't ask where the live data is yet. The old export format in §5 is kept for that later step. Import/export of the new app's own JSON (#40, #41) is still part of the build.

## 4. Requirements and pitfalls that are already known

- **No security hardening.** The user explicitly dropped it ("Nobody cares. I don't care."). Don't add Host/Origin checks, tokens or similar middleware. Still listen on `127.0.0.1` only, which costs nothing.
- **Compare Windows paths case-insensitively.** The folder path is the folder's unique key. The picker returned a path with one segment in different letter case from what was passed in (`c--Users…` vs `C--Users…`), so the same folder could be added twice. Normalize the key (for example a lowercase `path_key` column with a UNIQUE constraint) and keep the display path as returned.
- **Use `127.0.0.1`, not `localhost`.** Node resolves `localhost` to `::1` first, which caused `ECONNREFUSED` when the server listened on IPv4 only.
- **Browser shortcut conflicts (for when the user designs shortcuts later).** A browser tab can't capture Ctrl+T, Ctrl+W or Ctrl+N. Ctrl+F, Ctrl+C/V, Ctrl+E/S/D, number keys and Shift+Enter can be captured with `preventDefault`. The first build has no shortcuts besides arrow-key grid navigation (#16) and Down/Enter in the tag autocomplete (#29).
- **No drag-and-drop of folders to get their paths.** Browsers don't expose paths. Use the picker or paste a path.
- **Avoid `sharp`.** It's a native module. Serve original images for thumbnails until there's a real need.
- **Windows paths.** The old app hard-coded `\\`. Use `node:path`.
- **Spawn detached.** The old app used `execFileSync`, which blocked until the launched program exited. Launch `explorer.exe` detached, with `windowsHide: true` and `unref()`.

## 5. Feature list (user's picks recorded)

The user had forgotten many of these and went through this numbered list. Each item is marked **KEEP**, **CHANGED** or **REMOVED**. Build only KEEP and CHANGED items. Items still waiting on an answer are marked **ASK**.

**Model changes that affect many items:**
- **Language is removed entirely:** no column, no filter, no shortcuts, no settings. The user never used it.
- **Category becomes a normal tag type**, alongside author, parody, character and genre. It's no longer a fixed lookup table. Tag types are now `author`, `parody`, `character`, `genre` and `category`. Migration: the old `Category` value becomes a `category` tag, and `Language` is discarded.
- **New "opened" metadata** per folder: an open count (and ideally a last-opened time), incremented when the folder is opened in Explorer or in the built-in reader. It feeds the Popular sort (#25).
- **No keyboard shortcuts in the first build.** The user will design shortcuts later. Removed: the configurable Ctrl shortcuts, number keys and Shift+Enter. Kept: standard list behavior in the tag autocomplete (**Down arrow** to move into the suggestions, Enter to pick), which the user relies on with smart suggestions.
- **Context:** the library holds several media (manga, voice, games, anime and so on), and the folders are organized inconsistently. Nothing should assume one medium or a particular folder layout.

Key old files: `src/be/entity/Folder.ts` (search, import, export, clean-up, rename), `src/be/entity/Tag.ts` (tags, relations, manage/merge), `src/utilities/feUtilities.ts` (search parser), `src/fe/modules/foldersDisplay/FoldersDisplay.tsx` (grid keyboard navigation), `src/fe/components/FolderDialog/DialogContent.tsx` (tagging dialog and suggestions), `src/common/variables/*` (constants).

### A. Library
1. KEEP. **Add folder:** pick one folder.
2. CHANGED. **Add several folders at once:** replaces "Add parent folder". The picker is opened with `-Multi` (`FOS_ALLOWMULTISELECT`) and the user Ctrl- or Shift-clicks folders. **Verified:** an automated test selected 3 folders (with Japanese names) and got back exactly those 3. Limitation: one dialog can only select folders that sit in the same parent folder. Folders already in the library are skipped.
3. KEEP. **Automatic thumbnail:** `folder.jpg` if present, otherwise the first jpg/jpeg/png in the folder.
4. KEEP. **Remove from library** (right-click). The folder on disk isn't touched.
5. KEEP. **Rename folder on disk** (Ctrl+R opens a rename box). Tags are kept.
6. KEEP. **Clean-up:** remove entries whose folders no longer exist (their paths are logged to a JSON file) and re-find missing thumbnails.
7. KEEP. **Open in Explorer** (Ctrl+W). Increments the open count.
8. CHANGED. **The external program is replaced by a built-in reader.**
    - The old Ctrl+Q launched an external program that shows every image in the folder in one long top-to-bottom scroll, like a manga reader. The user wants that built into the app. The external-program feature and its setting are dropped.
    - Minimal version: a server route lists the folder's image files in natural order (`2` before `10`), another route streams an image by index, and the page renders a vertical column of `<img loading="lazy">`. Opening the reader increments the open count.
    - Later polish: remember the scroll position, fit-width/zoom, page indicator.
    - **Decided scope:**
      - **Only the image files directly in that folder.** Ignore subfolders entirely (no chapters, no recursion).
      - **Ignore zip/cbz and any other archives.**
      - **No special handling for folders without images.** Don't check, don't hide the option, don't show a message; the reader just shows nothing. The user knows which folders have images, so a check would be wasted work.
      - Suggested image extensions: jpg, jpeg, png, webp, gif, avif (case-insensitive).
    - Planned for the first build (my recommendation; the user didn't object).

### B. Browsing
9. KEEP. Grid of thumbnail cards with folder names.
10. KEEP. Pagination with 25, 50 or 100 per page.
11. CHANGED. **Category is a dynamic tag type.** Filter it through search (`category:manga`, `no_category`). **Decided:** a folder may have several categories, and the header keeps a **quick category dropdown**.
12. REMOVED (language is gone).
13. CHANGED. **Random mode uses the normal page size** (25, 50 or 100) and pages through a stable shuffle, so there are no duplicates across pages. It can still be switched on at startup. The old app showed up to 100 at once because `ORDER BY RANDOM()` reshuffles on every query.
    - Proposed fix: a `shuffle_key` column. "Shuffle" runs `UPDATE folders SET shuffle_key = random()` (milliseconds for thousands of rows), and random mode uses `ORDER BY shuffle_key` with ordinary LIMIT/OFFSET.
    - The order stays put across pages and reloads until the next shuffle.
    - `bun:sqlite` has no user-defined functions, so a seeded random function in SQL isn't an option.
14. KEEP. Clicking a folder's name copies the name to the clipboard.
15. KEEP. Right-click menu with all the folder actions.

### C. Selection and keyboard
16. KEEP. **Arrow keys** move the selection around the grid. Left and right wrap around; up and down move by row.
17. CHANGED. **No keyboard multi-select:** Shift+arrows and Ctrl+A are removed along with the other shortcuts. Mouse multi-select stays.
18. REMOVED. No configurable shortcuts in the first build; the user will design them later.

### D. Search
19. KEEP. **Plain words** match a tag of any type, or the folder name.
20. KEEP + **add `category:`**. **Typed search:** `name:`, `author:`, `parody:`, `character:`, `genre:`, `category:`. A key's value runs until `$` or the next key. Each space-separated word is a separate AND condition.
21. KEEP. **Exclude** with `-word`.
22. KEEP. **Exact match** with `"word"`: the tag name must match exactly, but the folder name still uses LIKE.
23. KEEP. **Short words:**
    - The minimum length is 3 letters, or 2 for parody and character. `-` adds 1 to the minimum, quotes add 2.
    - Words under 3 letters only match whole words (the old SQL used the LIKE patterns `"% x %"`, `"x %"` and `"% x"`).
    - `the` is ignored.
24. KEEP (also works for category). **Special filters:** `no_<type>` (no tag of that type), `have_<type>` (at least one), `many_<type>` (more than one).
25. CHANGED. **Sorting moves out of the search box into a sort control** with three options:
    - **Alphabetical** (the default).
    - **Updated:** newest first. Adding a folder counts as an update, so set `UpdatedAt` when adding.
    - **Popular:** most opened first, using the open count (Explorer and the built-in reader).
26. KEEP. **Default search** text applied at startup (a setting).

Write the parser as a pure, unit-tested function plus a SQL builder.

### E. Tagging
27. KEEP. **Tag dialog** with three modes, applied to all selected folders:
    - Add: appends tags.
    - Edit: replaces tags. It only works on one folder at a time.
    - Remove: removes the chosen tags.
    It also saves `UpdatedAt`.
28. CHANGED. No language field. Category is a tag input like the others. **No dialog shortcuts** (the number keys, `j`/`e` and Shift+Enter are all removed for now).
29. KEEP. Down arrow and Enter in the suggestion list must work, because that's how the user picks smart suggestions. **Tag autocomplete** from existing tags, sorted by most used. New tags are created on the fly, lowercased, with special characters stripped.
30. KEEP. Clicking a tag chip copies its text.
31. REMOVED. **Placeholder category and language:** pre-filled in Add mode when the folder has none.
32. REMOVED. **Copy and paste tags:** with one folder selected, Ctrl+C copies its tags. A dialog chooses which types get copied; the default is author only. Ctrl+V in the tag dialog pastes them.
33. KEEP. **Remove all tags** from the selected folders (right-click).

### F. Smart suggestions ("Calculate Tag Relations", run by hand from the menu)
KEEP, with the changes decided below. It learns from the library which tags go together:
34. Picking a **character** (with no parody set) auto-fills that character's parody.
35. Picking an **author** (with no parody set) auto-fills the author's *main parody* and moves the author's usual genres to the top of the genre suggestions.
36. Picking a **parody** moves its characters, and the authors who draw it, to the top of the suggestions.
37. Picking a **genre** (with no author set) moves the authors who use that genre to the top.
37b. NEW. Picking an **author** fills in or moves to the top that author's **main category**, using the same 51% rule as main parody. Most authors work in one medium.

**The "51% rule"** decides what counts as an author's "main parody" and "usual genres":
- A parody or genre counts for an author only if it appears in **more than half (51%)** of that author's folders.
- Using 51% and not 50% guarantees at most one main parody per author.
- It's only calculated for authors with **at least 5 folders** (`count > ceil(1/0.51²) = 4`), because a smaller sample means little.
- Parody→character has no threshold: it's the union of characters from folders with exactly one parody.
- The result was saved to `Setting/tags-relations.json`.
- In the new app this could be recalculated automatically instead of by hand.

**What the user decided on the proposed improvements:**
- **S1, live calculation: rejected.** Keep the manual **"Calculate Tag Relations"** button and its stored result; the user believes recalculating is heavy. Note for later: the old version was slow mostly because it ran one COUNT query per author in a loop (`findFrequentTags` in `Tag.ts`). A single GROUP BY query may be fast enough to run after each save, but **measure on the user's real data before proposing it again**.
- **S2, all tag types: rejected.** The only new pair is author→category (#37b). Characters and parodies span too many genres for co-occurrence to help.
- **S3, confidence numbers: rejected.** The user always checks suggestions before accepting them. What matters is that **the most likely tag is at the top** when they press Down arrow, not a percentage.
- **S4, parsing folder names: rejected.** The user cleans names, and the naming pattern only fits manga.
- **S5, near-duplicate warning: ACCEPTED.** When a new tag is created, warn if it's very close to an existing tag of the same type (typo, spacing or case), so tags don't split.
- **S6, sibling folders: rejected.** The user sometimes puts everything into one folder, so sibling folders mean nothing.

### G. Tag management
38. KEEP (now includes category). **Manage Tags:** for one tag type, lists tags with usage counts. You can rename, delete (by typing `delete` as the new value) or merge (renaming a tag to an existing one merges the two).
39. KEEP. **Clear unused tags.**

### H. Data and settings
40. KEEP. **Export** everything to JSON. This also ran automatically on every startup.
41. KEEP. Importing the **old app's** format is postponed (see §3); when it's done, the old Category becomes a tag and Language is dropped. **Import JSON** in two modes:
    - Append: only fills folders that have no tags yet.
    - Overwrite: replaces existing data.
    Folders are matched **by folder name**, so moved folders still match. Folders that couldn't be imported are written to an `IMPORT-FAILED` JSON file.
42. KEEP (reduced). **Settings:** default search (it can include `category:`) and random at startup. Removed: external program path, shortcut keys, default/placeholder category and language, and clipboard tag types.
43. REMOVED (Chrome devtools are enough). **Debug menu:** devtools, reload and open the app folder. A browser already provides most of these.
44. REMOVED (the slow Electron startup it covered is gone). **Splash screen** while the app starts.

### Old data model (for reference; see the model changes at the top of §5)
- **Folder:** PK `FolderLocation` (absolute path), `FolderName` (last path segment), `FolderThumbnail`, optional Category, optional Language, many-to-many Tags, `CreatedAt` and `UpdatedAt` (epoch ms).
- **Tag:** PK `TagId = "{type}-{name}"`, plus `TagName` and TagType.
- **Seeded lookup tables:**
  - TagType: `author`, `parody`, `character`, `genre`
  - Category: `manga`, `voice`, `game`, `anime`
  - Language: `english`, `japanese`, `speechless`

### Old export format (migration input)
```ts
type TransferData = {
  FolderLocation: string; FolderName: string;
  Category: string | null; Language: string | null;
  CreatedAt: number; UpdatedAt: number;
  Tags: { author: string[]; parody: string[]; character: string[]; genre: string[] };
}[]
```

### Old bugs not to copy
- `Folder.ts` `get`: for a typed tag under 3 letters, `orWhere` follows the TagType filter, so a tag of any type can match.
- `Tag.ts` `removeAllTagsFromFolders`: `manager.save()` isn't awaited, so it reports success before the save finishes.
- `Tag.ts` `getManagedTags` groups by `TagName`, not `TagId`.
- The parser's `.replace(/\s+/, ' ')` is missing the `g` flag.

## 6. Proven: native folder picker from the server

The user asked for proof before committing to this design. A throwaway test (since deleted at the user's request) passed **every check, three runs in a row**, on Node 22. It used only `node:http` and `node:child_process`, which Bun also supports.

**What was tested** (the test also had Origin checks, which have since been dropped): a real HTTP request reaches the server, the server runs PowerShell, the modern Vista-style dialog opens (the same `IFileOpenDialog` Electron uses), a UI Automation driver clicks Select Folder or Cancel, and the server returns JSON.

| Check | Result |
|---|---|
| Time from click to visible dialog | **about 440–500 ms** (PowerShell startup plus `Add-Type` compile; caching the compiled DLL could reduce it) |
| Dialog on top of the browser and holding keyboard focus | Yes |
| Unicode path, both ways: `テスト フォルダ – Ünïcødé 日本語 [1] & 100%` | Exact match |
| Cancel | `{"paths":[]}` |
| Multi-select (`FOS_ALLOWMULTISELECT`) | **Verified by automated test:** 3 folders selected through UI Automation `SelectionItemPattern` (Select + AddToSelection), and exactly those 3 paths came back |
| `explorer.exe <unicode path>` opened on the exact folder | Yes (checked through `Shell.Application.Windows()`) |

**Gotchas found:**
- Without `[Console]::OutputEncoding = UTF8`, non-ASCII paths come back garbled.
- Without a **TopMost invisible owner form**, the dialog can open behind the browser.
- Run `powershell.exe` with `-STA`.
- When automating the dialog for tests, `WM_SETTEXT` on the "Folder:" box is ignored, and the box isn't reachable through `GetDlgItem(0x47C)`. The reliable approach is to open the dialog with `-InitialPath <target>` and post `WM_COMMAND IDOK` (or `IDCANCEL`) to it.
- **Known cosmetic issue (not fixed):** the dialog opens toward the bottom-right, not centered, because it positions itself relative to the 1×1 owner form placed at the screen's center. A possible fix is to position the owner, or to center the dialog from an `IFileDialogEvents` callback.

**How the server ran it:**
```js
spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
  '-File', PICKER_SCRIPT, '-Title', 'Folder Tagger - Select folder', '-InitialPath', initialPath,
  /* optional */ '-Multi'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
// read stdout as UTF-8 → JSON.parse(stdout).paths
// allow only one picker at a time (return 409 if one is already open)
```

**The working `pick-folder.ps1` (keep it ASCII-only, because PowerShell 5.1 reads BOM-less files as ANSI):**
```powershell
param(
  [string]$InitialPath = '',
  [string]$Title = 'Select folder',
  [switch]$Multi
)

$ErrorActionPreference = 'Stop'
# Without this, non-ASCII paths (e.g. Japanese folder names) come back mangled.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class FolderPicker
{
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRCW { }

    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr hwndOwner);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
        void GetResults(out IShellItemArray ppenum);
        void GetSelectedItems(out IShellItemArray ppsai);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport, Guid("b63ea76d-1f85-456f-a19c-48159efa858b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemArray
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppvOut);
        void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
        void GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
        void GetAttributes(int attribFlags, uint sfgaoMask, out uint psfgaoAttribs);
        void GetCount(out uint pdwNumItems);
        void GetItemAt(uint dwIndex, out IShellItem ppsi);
        void EnumItems(out IntPtr ppenumShellItems);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

    private const uint FOS_NOCHANGEDIR = 0x8;
    private const uint FOS_PICKFOLDERS = 0x20;
    private const uint FOS_FORCEFILESYSTEM = 0x40;
    private const uint FOS_ALLOWMULTISELECT = 0x200;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    public static string[] Pick(IntPtr owner, string title, string initialPath, bool multi)
    {
        var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
        try
        {
            uint options;
            dialog.GetOptions(out options);
            options |= FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR;
            if (multi) options |= FOS_ALLOWMULTISELECT;
            dialog.SetOptions(options);
            dialog.SetTitle(title);

            if (!string.IsNullOrEmpty(initialPath))
            {
                try
                {
                    var iid = typeof(IShellItem).GUID;
                    IShellItem folder;
                    SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref iid, out folder);
                    dialog.SetFolder(folder);
                }
                catch { /* Missing initial folder: just open at the default location. */ }
            }

            int hr = dialog.Show(owner);
            if (hr == ERROR_CANCELLED) return new string[0];
            Marshal.ThrowExceptionForHR(hr);

            IShellItemArray results;
            dialog.GetResults(out results);
            uint count;
            results.GetCount(out count);
            var paths = new string[count];
            for (uint i = 0; i < count; i++)
            {
                IShellItem item;
                results.GetItemAt(i, out item);
                item.GetDisplayName(SIGDN_FILESYSPATH, out paths[i]);
            }
            return paths;
        }
        finally
        {
            Marshal.ReleaseComObject(dialog);
        }
    }
}
'@

Add-Type -AssemblyName System.Windows.Forms

# An invisible, topmost owner window. The dialog is owned by it, so the dialog
# also stays on top instead of opening behind the browser window.
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = 'None'
$owner.Opacity = 0
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.StartPosition = 'CenterScreen'
$owner.Show()
$owner.Activate()

try {
  $paths = [FolderPicker]::Pick($owner.Handle, $Title, $InitialPath, $Multi.IsPresent)
  [Console]::Out.Write((ConvertTo-Json -Compress -InputObject @{ paths = @($paths) }))
}
finally {
  $owner.Close()
}
```

## 7. Suggested next steps
1. Install Bun (permitted).
2. Scaffold a Bun workspace with `server/` (Hono, SQLite, migrations) and `web/` (Svelte 5, Vite, shadcn-svelte, Tailwind v4). In development, Vite proxies to the server. In production, the server serves the built `web/dist`. Add a script that starts the server and opens `msedge --app=http://127.0.0.1:<port>`.
3. Port the search parser first, test-first with `bun test`, because the search syntax is the heart of the app. Then the SQL builder against an in-memory SQLite database.
4. Build only the features marked KEEP or CHANGED in §5, including the built-in reader (#8). Prove anything uncertain with a real test before building on it.
5. After the app is done: migrate the user's old data (§3, item 4).
6. Commit only when the user asks. Use the attribution trailer given in the session.

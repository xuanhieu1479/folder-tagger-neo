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

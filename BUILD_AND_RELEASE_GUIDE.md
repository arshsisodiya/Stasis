# Stasis Build and Release Guide

This document outlines the standard procedures for building the Stasis application with a custom version and managing Git releases via tags.

---

## 1. Building the Application

The project includes a PowerShell script (`build.ps1`) that orchestrates the entire build process, including updating version numbers, compiling the Python backend, and building the Tauri desktop application.

To build the app with a specific version, open a PowerShell terminal in the **project root directory** and use the `-Version` flag:

```powershell
.\build.ps1 -Version 1.2.3
```
*(Replace `1.2.3` with your desired version number)*

### What the build script does:
1. **Synchronizes Versions:** Automatically updates `tauri.conf.json`, `package.json`, and `Cargo.toml` to the specified version.
2. **Generates Metadata:** Creates the Windows File Version Info for the backend executable.
3. **Builds Backend:** Uses PyInstaller to build the standalone Python backend (`stasis-backend.exe`).
4. **Builds Desktop App:** Runs the `npm run tauri:build` process to compile the React frontend and package everything into an NSIS Windows installer.

**Build Output:** Once completed, the final installer executables will be located in the `frontend\src-tauri\target\release\bundle` directory.

---

## 2. Git Tagging and Releasing

Tagging is used to mark specific points in your repository's history as important, most commonly for releases (e.g., `v1.0.0`). 

### Creating a Git Tag
To create an annotated tag for your current commit, use the following command. It is standard practice to prefix the version number with a `v`:

```bash
git tag -a v1.2.3 -m "Release version 1.2.3"
```

### Pushing Commits and Tags All at Once
If you have just committed your version bump changes and created a tag, you can push both the new commits and the new tag to the remote repository simultaneously using:

```bash
git push --follow-tags
```
*Note: `--follow-tags` is the recommended method. It safely pushes commits and only the annotated tags that are attached to the commits being pushed.*

### Pushing Only a Specific Tag
If your commits have already been pushed, or if you specifically only want to push the tag itself (often used to trigger CI/CD release pipelines), use:

```bash
git push origin v1.2.3
```

### Pushing All Local Tags (Use with caution)
If you have created multiple tags locally and want to push all of them to the remote at once, you can use:

```bash
git push --tags
```
*Note: This will push all tags, regardless of whether they are annotated or lightweight, which might include temporary or experimental tags you didn't intend to share.*

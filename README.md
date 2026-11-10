# Spare Notes

A minimal, single-user notes app you host yourself. It runs on cheap shared/managed
PHP hosting with no database server, no build step and no dependencies to install:
upload the files, visit the site, choose a password, and start writing.

Notes live in your browser first (so the app works offline) and sync to a single
SQLite file on your server, so every device you sign in on sees the same notes.

## Features

- Rich-text editor with headings, bold/italic/underline, quotes and links
- Images (resized and embedded in the note) and tables
- Tags, and instant search from the library by typing
- Revision history: the last 10 versions of each note are kept on the server
- Export to `.txt`, `.md`, `.docx` or `.pdf`
- Direct links to individual notes (`?n=<note-id>`), for your own signed-in devices
- Installable as an app (PWA) and works offline
- Fonts (including OpenDyslexic), text size and light/dark colours in Preferences
- Server backups of the database, on demand and automatically once a day

## Requirements

- PHP 7.4 or newer with the `pdo_sqlite` extension (standard on almost every host)
- HTTPS. Your password is sent at sign-in, so do not run this over plain HTTP.
- Apache is assumed for the bundled `.htaccess` rules. On nginx or other servers those
  rules do nothing, so keep the database outside the web root (see below).

## Install

1. **Upload** all files in this repository to a folder on your host, e.g.
   `public_html/notes/`.
2. **Recommended: put the data outside the web root.** Copy
   `api/config.local.php.example` to `api/config.local.php` and set `db_path` to a folder
   that is not publicly served, for example:

   ```php
   <?php
   return [
       'db_path' => '/home/youruser/private/spare-notes/database.sqlite',
   ];
   ```

   The folder is created automatically. If you skip this step the database is stored in
   `api/`, protected only by `api/.htaccess`.
3. **Visit the site straight away and choose a password.** Until a password is set,
   the first visitor gets to choose it.
4. Optionally use your browser's "Install" / "Add to Home Screen" to install it as an app.

## Configuration

Settings are read from `api/config.php`, which you should not edit. Override them in
`api/config.local.php` (git-ignored), or with environment variables. If both are set,
the environment variable wins.

| Setting     | Environment variable  | Default                      | Purpose                                         |
|-------------|-----------------------|------------------------------|-------------------------------------------------|
| `db_path`   | `SPARE_NOTES_DB_PATH` | `api/database.sqlite`        | Location of the SQLite database                 |
| `auth_path` | none                  | `auth.data.php` next to the DB | Location of the password hash and signing key |

On Apache you can set the environment variable with `SetEnv SPARE_NOTES_DB_PATH /path/to/database.sqlite`.

### Files created at runtime

These are created by the app and are never committed (see `.gitignore`):

| File                          | Contents                                                             |
|-------------------------------|----------------------------------------------------------------------|
| `database.sqlite`             | Your notes and revisions                                              |
| `auth.data.php`, `*.lock`     | Password hash, cookie signing key, failed-login counter               |
| `api/settings.json`           | The server backup folder chosen in Preferences                        |

`auth.data.php` begins with a PHP guard, so even if it sits in the web root, requesting it
returns nothing.

## Using the app

Everything is in the menu: **right-click** anywhere, press **Ctrl/Cmd + K**, or tap
**⋯** on mobile.

| Where      | Key                    | Action                                     |
|------------|------------------------|--------------------------------------------|
| Anywhere   | Ctrl/Cmd + K           | Open the menu                              |
| Editor     | Ctrl/Cmd + S           | Save now (notes also save as you type)     |
| Editor     | Tab in a table's last cell | Add a new row                          |
| Library    | Type                   | Filter notes by title, content or tag      |
| Library    | ↑ / ↓, Enter           | Move through notes and open one            |
| Library    | Esc                    | Clear the filter                           |

The dot in the bottom-right corner shows sync status: green when synced, yellow while
saving or syncing, red when offline or there is an error.

## Signing in and devices

- Each browser or device asks for the password once and then stays signed in. The
  sign-in renews automatically whenever you use the app, so a device only needs the
  password again if it goes unused for more than 400 days.
- There is no limit on how many devices can be signed in.
- A device that has signed in before can open and edit notes offline; changes sync
  when it reconnects.
- **Preferences → Account** has three controls:
  - **Change Password** also signs out every other device.
  - **Sign Out All Other Devices** keeps only the current one signed in.
  - **Sign Out of This Device** also removes the notes stored in that browser. They
    remain on the server, and you are warned about unsynced changes first.
- After 5 wrong passwords, sign-in is paused for 30 seconds, doubling with each
  further failure up to 15 minutes. Devices that are already signed in are unaffected.

**Forgot your password?** Delete `auth.data.php` (it is next to your database, unless you
set `auth_path`). The next visit shows first-time setup again, and every device must
sign in again. Your notes are not affected.

## Backups

In **Preferences → Server Backup**, enter a folder on the server (an absolute path, or
one relative to `api/`) and click **Run Server Backup Now**. While the app is open, a
backup is also made automatically once a day. Backups are named
`notes_backup_YYYYMMDD_HHMMSS.sqlite`. The newest 30 are kept, and any older than 30
days are deleted. Choose a folder outside the web root.

To back up by hand, copy `database.sqlite` while the app is not being used.

## Updating

Upload the new files over the old ones. Do not delete `api/config.local.php`, your
database, or `auth.data.php`. The app caches itself for offline use, so each browser
picks up the new version after one reload; until then the sync dot may show red.

**Moving an existing database:** set `db_path` as described above, then move both
`database.sqlite` and `auth.data.php` from `api/` into the new folder. If you move only the
database, you will be asked to set a password again.

## Security notes

- All API endpoints require sign-in. The sign-in cookie is `HttpOnly`, `SameSite=Strict`,
  marked `Secure` over HTTPS, and signed with a key only the server knows.
- Note HTML is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify) before it
  is displayed or saved, so a note cannot run script.
- Errors are written to the server's PHP error log. Clients only get a generic message.
- A device that is signed out elsewhere (with "Sign Out All Other Devices" or a password
  change) loses access to the server straight away. Notes already stored in that
  browser are hidden behind the sign-in screen but not erased from it.

## License

[MIT](LICENSE). The bundled libraries in `vendor/` are under their own licenses.

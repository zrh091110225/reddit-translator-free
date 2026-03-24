# Chrome Web Store Submission Draft

Last updated: 2026-03-24

## 1) Store Listing

### Extension Name

`Reddit Translator Free`

### Short Description

`Translate Reddit posts and comments inline. Support homepage feed, post threads, language switch auto-refresh, and custom translation style.`

### Detailed Description

```text
Reddit Translator Free is a lightweight browser extension for translating Reddit content inline.

Key features:
- Translate Reddit homepage/list feed post titles and post bodies
- Translate post page content and comment threads
- Target language selection (Chinese, English, Japanese, Korean, French, German, Spanish)
- Optional "translate only non-target-language" mode
- Auto-refresh current page after language switch for instant effect
- Custom translation text color and font size
- Built-in popup stats for quick debugging (candidates, translated, failed, queue, cache)
- Quick access buttons: Telegram contact and extension review page

How it works:
The extension detects text blocks on reddit.com pages and inserts translated content below the original text while keeping page reading flow natural.

Permissions used:
- storage: save user translation preferences
- tabs: communicate with and refresh current tab after language changes
- host permissions on reddit.com and translate.googleapis.com for page translation only
```

### Category

`Productivity`

### Default Language

`English (United States)`

## 2) Images & Assets

### Icon

- `assets/store/icons/icon-128.png`

### Screenshots (recommended upload order)

1. `assets/store/screenshots/01-home-feed-translation-1280x800.png`
2. `assets/store/screenshots/02-comments-translation-1280x800.png`
3. `assets/store/screenshots/03-only-non-target-1280x800.png`
4. `assets/store/screenshots/04-toggle-disabled-1280x800.png`
5. `assets/store/screenshots/05-extension-page-1280x800.png`

## 3) Privacy & Data Disclosure

### Data Sale

`No`

### Advertising / Personalized Ads

`No`

### Personal or Sensitive Data Collection

`No`

### Privacy Policy URL

`https://github.com/zrh091110225/reddit-translator-free/blob/main/PRIVACY.md`

## 4) Single Purpose & Permission Justification

### Single Purpose

```text
This extension’s single purpose is to translate Reddit page content inline so users can read posts and comments in their target language.
```

### Permissions Justification

```text
- storage: stores user settings such as target language, translation style, and toggle states.
- tabs: sends update messages to the active Reddit tab and reloads the active tab when language changes.
```

### Host Permissions Justification

```text
- https://www.reddit.com/* and https://reddit.com/*: read page text to insert inline translations.
- https://translate.googleapis.com/*: request translation results for detected text blocks.
```

## 5) Support Information

### Homepage URL

`https://github.com/zrh091110225/reddit-translator-free`

### Support URL

`https://github.com/zrh091110225/reddit-translator-free/issues`

### Contact

`Telegram: https://t.me/+gtiMtJPEG_tiYmYx`

## 6) Reviewer Notes (Optional)

```text
Test flow:
1) Open reddit.com homepage or any /r/.../comments/... page.
2) Open extension popup and set target language.
3) Confirm inline translations appear below original post/comment text.
4) Toggle "only translate non-target-language" and verify matching-language text is skipped.
5) Change target language and verify current tab auto-refreshes and translation updates.

No account login is required for basic testing.
```


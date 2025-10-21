# Assets Directory

This directory contains static assets (images and videos) for Fake Rares that have issues with S3 scanning or need alternative hosting.

## Purpose

When assets don't display properly through the normal S3/ordinal scanning process, you can:
1. Convert/fix the problematic asset (e.g., WEBP → JPG, compress MP4)
2. Place it in this GitHub-hosted assets directory
3. Override the default behavior by adding `imageUri` or `videoUri` to the asset entry in `fake-rares-data.json`

## Structure

```
assets/
├── images/          # JPG, PNG, WEBP images
└── videos/          # MP4, WEBM videos
```

## Usage

### Step 1: Add Asset to GitHub
Place your fixed asset in the appropriate folder (images/ or videos/)

### Step 2: Get the Raw URL
```
https://raw.githubusercontent.com/[username]/Fake-Rare-TG-Agent/[branch]/pepe-tg/src/assets/images/[filename]
https://raw.githubusercontent.com/[username]/Fake-Rare-TG-Agent/[branch]/pepe-tg/src/assets/videos/[filename]
```

### Step 3: Override in Data File
Add `imageUri` or `videoUri` to the asset entry in `fake-rares-data.json`:

```json
{
  "asset": "THEBIGDEGEN",
  "series": 17,
  "card": 50,
  "ext": "jpg",
  "artist": "ZeroG",
  "imageUri": "https://raw.githubusercontent.com/0xRabbidfly/pepedawn-agent/master/pepe-tg/src/assets/images/THEBIGDEGEN.jpg"
}
```

This will bypass the S3 scanning and use your GitHub-hosted version instead.

### ⚠️ Important: Use Raw URLs

**Always use `raw.githubusercontent.com` URLs, NOT `github.com/blob` URLs!**

- ✅ **Correct**: `https://raw.githubusercontent.com/[user]/[repo]/[branch]/path/to/file.jpg`
- ❌ **Wrong**: `https://github.com/[user]/[repo]/blob/[branch]/path/to/file.jpg`

The `github.com/blob` URL shows the web page wrapper, not the actual file content. Only `raw.githubusercontent.com` serves the direct file for embedding in applications.

## Guidelines

- **File Size**: Keep files under 100MB (GitHub limit)
- **Naming**: Use descriptive names matching the asset name (e.g., `THEBIGDEGEN.jpg`)
- **Compression**: Compress images and videos before uploading
- **Formats**: 
  - Images: JPG, PNG, WEBP
  - Videos: MP4 (H.264 codec recommended)

## Example

For asset `THEBIGDEGEN`:
- Place image: `assets/images/THEBIGDEGEN.jpg`
- URL: `https://raw.githubusercontent.com/[username]/Fake-Rare-TG-Agent/main/pepe-tg/src/assets/images/THEBIGDEGEN.jpg`


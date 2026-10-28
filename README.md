# Photo Studio — Passport Photo Maker & Professional Print Studio

> Complete browser-based photo studio that combines passport photo creation, AI-assisted portrait enhancement, manual retouching, background replacement, formal portrait styling, and 300 DPI high-resolution print-sheet generation.

**Live Application:** [https://pic.amitjoshi.info.np/](https://pic.amitjoshi.info.np/)

---

## 🌟 Key Features

1. **Guided 5-Step Professional Wizard**
   - **Step 1: Passport Standards & Crop**: Official templates for Nepal e-Passport/MRP (35×45mm), US Visa/Passport (2×2"), Schengen EU (35×45mm), UK, India, Canada, Japan, and custom mm/inches with biometric head oval & eye-line guides.
   - **Step 2: AI Portrait Clarity & Lighting**: Local skin smoothing preserving eyes/lips, unsharp contour enhancement, and noise reduction.
   - **Step 3: Background Studio**: Auto background segmentation with perimeter floodfill and edge feathering. Choose official presets (Pure White, Nepal Light Blue `#A5C9EB`, Off-White, Light Gray) or any custom color via the color picker.
   - **Step 4: Retouch & Formal Outfits**: Blemish healer brush, skin smoothing brush, eye brightener, plus formal business suits, blazers, and traditional Daura Suruwal coats.
   - **Step 5: Professional Print Sheet & Export**: Arrange multiple copies on 4×6" (10×15cm), A4, US Letter, or 5×7" with drag-and-drop manual positioning, copy rotation, snapping, hairline cut borders, direct printing with zero top offset, and high-res 300 DPI PNG/JPG download.

2. **Step Stepper with Checkmarks**
   - Displays real-time checkmark badges for completed/visited steps.
   - Jump between steps freely or use the "Next Step" / "Skip" flow.

3. **100% Privacy & Offline Capability**
   - All image manipulation runs directly inside the client's browser using HTML5 Canvas and mathematical convolution filters.
   - Automatic local draft saving in IndexedDB (`PhotoStudioDB_v1`) protects ongoing work against accidental tab closures.
   - No photos are uploaded to any external server.

4. **Service & Tool Request System**
   - Users can request custom country visa formats, bulk passport batching, or specialty tools directly via WhatsApp (+977 9746241860).

---

## 🚀 GitHub Pages Deployment

This project uses a 100% static frontend architecture (Vite + React + Tailwind CSS) with relative asset resolution (`base: './'`), making it immediately compatible with GitHub Pages or any static CDN.

### Automatic GitHub Actions Deployment:
A pre-configured GitHub Actions workflow is located at `.github/workflows/deploy.yml`. Once you push this repository to GitHub:
1. Navigate to your repository **Settings > Pages**.
2. Under **Build and deployment > Source**, select **GitHub Actions**.
3. Push to `main` or `master`, and GitHub will automatically build and publish the site.

### Local Development:
```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build production static bundle for GitHub Pages
npm run build
```

---

## 📞 Technical Support & Contact
- **Email:** admin@amitjoshi.info.np
- **WhatsApp:** +977 9746241860
- **Domain:** [https://pic.amitjoshi.info.np/](https://pic.amitjoshi.info.np/)

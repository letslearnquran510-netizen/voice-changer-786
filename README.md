# 🎙️ Gemini Voice Morph

**Real-time AI Voice Transformation** powered by Google Gemini Native Audio API

Transform your voice in real-time with different personas - from Indian accents to Arabic, children's voices to elderly. Perfect for content creation, voice acting practice, or just having fun!

![Voice Morph Demo](https://img.shields.io/badge/Status-Live-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- 🎭 **6 Voice Personas** - Indian, Pakistani, Arabic, Child, Asian, and Elderly voices
- 🌍 **12 Languages** - English, Hindi, Urdu, Arabic, Spanish, French, German, Chinese, Japanese, Korean, Portuguese, Russian
- 📜 **Live Transcription** - Real-time speech-to-text in your selected language
- 📁 **File Processing** - Upload audio files for voice transformation
- 🎚️ **Voice Activity Detection** - Intelligent noise gate with adjustable threshold
- 💾 **Recording Export** - Download your transformed audio sessions
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- A Google Gemini API key (get it free from [AI Studio](https://aistudio.google.com/apikey))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gemini-voice-morph.git
cd gemini-voice-morph

# Install dependencies
npm install

# Set up your API key
cp .env.local.example .env.local
# Edit .env.local and add your GEMINI_API_KEY

# Start development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

## 🌐 Deployment Options

### Option 1: Vercel (Recommended - Free)

1. **Create Vercel Account**: Go to [vercel.com](https://vercel.com) and sign up
2. **Import Project**: Click "New Project" → Import from GitHub
3. **Configure Environment**:
   - Add environment variable: `GEMINI_API_KEY` = your API key
4. **Deploy**: Click Deploy!

```bash
# Or use Vercel CLI
npm i -g vercel
vercel --prod
```

### Option 2: Netlify (Free)

1. **Create Netlify Account**: Go to [netlify.com](https://netlify.com)
2. **New Site from Git**: Connect your GitHub repository
3. **Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Environment Variables**: Add `GEMINI_API_KEY`
5. **Deploy**!

### Option 3: Render (Free)

1. **Create Render Account**: Go to [render.com](https://render.com)
2. **New Static Site**: Connect repository
3. **Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Environment Variables**: Add `GEMINI_API_KEY`

### Option 4: Railway (Free Tier)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Option 5: Hostinger VPS

```bash
# SSH into your VPS
ssh user@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone https://github.com/yourusername/gemini-voice-morph.git
cd gemini-voice-morph
npm install
npm run build

# Install PM2 for process management
npm install -g pm2

# Serve with PM2
pm2 serve dist 3000 --name voice-morph --spa

# Save PM2 config
pm2 save
pm2 startup
```

### Option 6: Cloudflare Pages (Free)

1. **Create Cloudflare Account**: Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. **Create Project**: Connect to GitHub
3. **Build Settings**:
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment Variables**: Add `GEMINI_API_KEY`

### Option 7: GitHub Pages (Free)

Add to `vite.config.ts`:
```typescript
base: '/gemini-voice-morph/',
```

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

## 📁 Project Structure

```
gemini-voice-morph/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── AudioVisualizer.tsx
│   │   ├── PersonaCard.tsx
│   │   └── TranscriptPanel.tsx
│   ├── hooks/
│   │   └── useGeminiLive.ts
│   ├── utils/
│   │   └── audio.ts
│   ├── App.tsx
│   ├── constants.ts
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── .env.local
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 🎭 Available Personas

| Persona | Voice | Description |
|---------|-------|-------------|
| 🇮🇳 Priya | Kore | Authentic Indian female voice |
| 🇵🇰 Zara | Zephyr | Elegant Pakistani female voice |
| 🌙 Layla | Zephyr | Rich Arabic female voice |
| 🧒 Leo | Puck | Energetic child voice |
| 🎋 Mei | Kore | Precise East Asian accent |
| 👴 Grandpa Earl | Fenrir | Deep elderly voice |

## 🛠️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Your Google Gemini API key | ✅ Yes |

### Voice Activity Detection

Adjust the "Gate Thresh" slider to control microphone sensitivity:
- **Low values** (0.001): Captures soft speech, may pick up background noise
- **High values** (0.1): Only captures loud, clear speech

## 🔧 Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📝 License

MIT License - feel free to use for personal and commercial projects.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

## 🙏 Credits

- **Google Gemini** - AI Voice Processing
- **React** - UI Framework
- **Tailwind CSS** - Styling
- **Vite** - Build Tool

---

Made with ❤️ for voice transformation enthusiasts

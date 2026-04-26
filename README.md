# 🗳️ Votika: AI-Powered Election Guide Assistant

Votika is a sophisticated, AI-driven assistant designed to guide Indian voters through the complexities of the electoral process. Built with a focus on professional aesthetics, security, and high performance, Votika serves as a mentor and guide for upcoming elections.

![Votika UI](https://via.placeholder.com/800x400?text=Votika+Dashboard+Preview)

## ✨ Key Features

- **🧠 Intelligent Persona**: Powered by **Gemini 1.5 Flash**, Votika communicates as an articulate, mid-20s mentor—professional yet approachable.
- **📅 Dynamic Election Dashboard**: Real-time tracking of upcoming Indian elections (2025-2026) with automated refresh cycles.
- **📦 Dual-Layer Caching**: High-efficiency architecture utilizing both **In-Memory** and **Google Cloud Firestore** caching to minimize API costs and latency.
- **🛡️ Production-Ready Security**: Implements industry standards including **Secret Injection**, **Helmet.js** protection, and strict `.gitignore` policies.
- **💎 Premium UI**: A modern, responsive dashboard built with **Angular** and **SCSS**, featuring custom micro-animations and a sleek "Votika" branding.

## 🛠️ Tech Stack

- **Frontend**: Angular 18+, SCSS (Modular architecture)
- **Backend**: Node.js, Express.js
- **AI Engine**: Vertex AI (Google Gemini 1.5 Flash)
- **Database/Cache**: Google Cloud Firestore
- **Security**: Helmet, CORS, Environment-based Secret Management

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A Google Cloud Project with **Vertex AI** and **Firestore** enabled.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/election-assistant.git
   cd election-assistant
   ```

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm start
   ```

3. **Backend Setup**
   ```bash
   cd ../backend
   npm install
   ```

### 🔐 Configuration

Create a `.env` file in the `backend` directory:
```env
PROJECT_ID=your-google-cloud-project-id
LOCATION=us-central1
MODEL_NAME=gemini-1.5-flash-001
GOOGLE_APPLICATION_CREDENTIALS=service-account.json
PORT=3000
```

*Note: Ensure your `service-account.json` is placed in the `backend` folder. This file is ignored by Git for security.*

## 🏗️ Architecture & Efficiency

This project implements a **Service-Oriented Architecture**:
- **Logic Layer**: All business logic and AI orchestration are handled within the `ElectionService`.
- **Caching Layer**: 
    - **L1 (Memory)**: Instant retrieval for repeat requests.
    - **L2 (Firestore)**: Persistent 7-day cache to reduce AI token usage.
- **Security**: Credentials can be injected via `FIREBASE_SERVICE_ACCOUNT` environment variable for zero-file production deployments.

## 📄 License
This project is licensed under the MIT License.

---
*Built with ❤️ for the Indian Electoral Process.*

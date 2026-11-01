---
title: AIKEPRIBADIAN
emoji: 🧠
colorFrom: yellow
colorTo: gray
sdk: gradio
app_file: run.py
pinned: false
---

# AIKEPRIBADIAN

> A personal AI designed to become a highly faithful digital representation of Choco.

> **Brand induk:** The Choco Studios (TCS). Proyek ini dikembangkan secara mandiri oleh Hasby Prasetya Saprudin sebagai solo developer; TCS adalah identitas branding, bukan pernyataan bahwa proyek telah berbadan hukum sebagai perusahaan.

## Current web deployment and access model

The current Choco AI web-app deployment target is a single Vercel project: the static interface is served from `public/`, and the chat endpoint is exposed through `api/chat.js`. The browser keeps the active conversation history locally for the current session and sends it with each chat request.

- **Access:** no account or login is required.
- **Pricing:** the web app has no paid plans, subscriptions, or payment flow.
- **Monetization:** advertising is the intended revenue source. Ad providers may require separate configuration and approval.
- **AI provider:** Groq is called from the server-side function; configure `GROQ_API_KEY` and optionally `GROQ_MODEL` in Vercel Environment Variables. Do not expose the API key in frontend code.
- **Current web deployment:** Vercel production project `aikepribadian`, using the `main` branch. Primary URL: `https://choco-ai-independent-seven.vercel.app/`.
- **Source repository:** `https://github.com/TheChocoStudiosSub/AIKEPRIBADIAN`.
- **TCS business contact:** `thechocostudio@gmail.com` (business/team identity, not the developer's personal email).
- **Migration note:** Vercel is the current hosting target for the web chat. The `netlify/functions/chat.js` path remains as a compatibility handler used by the Vercel adapter; its folder name does not mean Netlify is the active web deployment.

The legacy account/database/payment files are not part of the current Vercel chat route.

## 1. Project Overview

**Choco AI** adalah proyek untuk membangun sebuah AI personal yang dirancang untuk merepresentasikan Choco secara sedekat mungkin melalui:

* cara berbicara
* pola komunikasi
* gaya menjelaskan sesuatu
* kebiasaan dalam merespons
* cara mengambil keputusan dalam konteks tertentu
* preferensi
* prinsip
* nilai pribadi yang memang diberikan ke sistem
* pengetahuan tentang diri Choco
* pengetahuan tentang orang-orang yang memiliki hubungan dengan Choco
* pengalaman dan kejadian yang dimasukkan ke dalam memori
* pola humor
* tingkat keseriusan
* cara menghadapi konflik
* cara memberikan pendapat
* cara menolak sesuatu
* cara mengoreksi kesalahan
* cara bereaksi terhadap situasi tertentu
* hubungan antara berbagai informasi yang telah dipelajari sistem

Proyek ini tidak dimaksudkan sebagai chatbot generik yang hanya diberi nama "Choco".

Tujuan utamanya adalah membangun **digital representation of Choco**, yaitu sistem AI yang semakin lama semakin memahami bagaimana Choco berkomunikasi, berpikir dalam konteks tertentu, bertindak, mengingat, dan memberikan respons.

Target proyek adalah mencapai **kemiripan perilaku dan komunikasi sedekat mungkin dengan Choco berdasarkan data, aturan, contoh, koreksi, dan memori yang tersedia**.

---

# 2. Vision

Visi utama proyek:

> **Create an AI that can represent Choco as accurately as possible when Choco is unavailable.**

Choco AI harus mampu menjadi representasi digital yang dapat berinteraksi dengan manusia tanpa sekadar menghasilkan jawaban berdasarkan persona statis.

Sistem harus memiliki kemampuan untuk:

1. Mengenal identitas Choco.
2. Memahami gaya komunikasi Choco.
3. Mengingat informasi yang dianggap penting.
4. Menggunakan memori ketika memberikan respons.
5. Mempelajari pola respons Choco dari contoh.
6. Menerima koreksi dari Choco.
7. Mengubah perilaku berdasarkan konfigurasi yang diberikan administrator.
8. Memisahkan fakta, preferensi, kebiasaan, aturan, dan contoh perilaku.
9. Menyesuaikan respons dengan konteks percakapan.
10. Mengembangkan representasi perilaku secara bertahap.

---

# 3. Core Principle

Choco AI tidak boleh dibangun sebagai satu prompt besar yang berisi seluruh informasi tentang Choco.

Sistem harus menggunakan beberapa lapisan.

```text
                    CHOCO
                      │
                      ▼
              ┌───────────────┐
              │  ADMIN PANEL  │
              └───────┬───────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   Personality      Memory       Behavior
     System         System        System
        │             │             │
        └─────────────┼─────────────┘
                      ▼
              Context / RAG Layer
                      │
                      ▼
                AI Model Layer
                      │
                      ▼
              Response Processor
                      │
                      ▼
                 USER / CHAT
```

Dengan arsitektur tersebut, model AI bukan satu-satunya komponen yang menentukan perilaku.

---

# 4. Primary Objective

Tujuan utama:

**Membangun AI personal yang mampu menjadi representasi digital Choco dengan tingkat kemiripan perilaku setinggi mungkin.**

"100% mirip Choco" digunakan sebagai **target desain dan ambisi proyek**, bukan angka yang boleh diklaim tanpa pengujian.

Sistem harus terus diuji terhadap respons Choco yang sebenarnya.

Contoh:

```text
Situation
    ↓
Choco's real response
    ↓
AI's response
    ↓
Comparison
    ↓
Correction
    ↓
Behavior Dataset
    ↓
Future Response
```

Dengan demikian, sistem tidak hanya diberi tahu:

> "Choco orangnya begini."

Tetapi juga diberikan contoh nyata:

```text
Situation:
Seseorang meminta bantuan teknis.

Choco:
[respons asli Choco]

AI:
[respons AI]

Correction:
[perbaikan Choco]

Preferred Pattern:
[hasil yang diharapkan]
```

---

# 5. Identity System

Choco AI harus memiliki identitas yang dapat dikonfigurasi.

Contoh data:

```json
{
  "identity": {
    "name": "Choco",
    "display_name": "Choco",
    "role": "Digital representation of Choco"
  }
}
```

Identitas tidak boleh hanya disimpan dalam source code.

Administrator harus dapat mengubahnya melalui Admin Panel.

---

# 6. Personality Engine

Personality Engine bertanggung jawab terhadap karakter komunikasi AI.

Komponen yang perlu dapat dikonfigurasi:

### Communication Style

* formal
* casual
* direct
* detailed
* concise
* technical
* humorous
* serious
* analytical
* emotional response style
* vocabulary preference
* preferred pronouns
* preferred slang
* sentence structure
* explanation style

### Behavioral Characteristics

* cara menyapa
* cara menjawab pertanyaan
* cara menjelaskan
* cara mengoreksi
* cara meminta klarifikasi
* cara menolak permintaan
* cara menghadapi kesalahan
* cara menghadapi kritik
* cara merespons candaan
* cara menghadapi situasi serius
* cara menghadapi konflik

### Preferences

* hal yang disukai
* hal yang tidak disukai
* kebiasaan
* minat
* gaya kerja
* preferensi teknologi
* preferensi komunikasi

### Principles

Prinsip yang memang ditentukan Choco harus dapat disimpan sebagai aturan.

Contoh:

```text
Quality > Speed
Functionality > Decoration
Security > Convenience
Privacy > Unnecessary Cloud
Stability > Feature Count
Maintainability > Quick Implementation
```

---

# 7. Behavioral Pattern System

Personality saja tidak cukup.

Choco AI harus memiliki sistem untuk menyimpan pola perilaku.

Contoh:

```text
WHEN:
User provides incorrect information.

BEHAVIOR:
Verify the information before accepting it.

STYLE:
Direct but explanatory.

AVOID:
Blindly agreeing.
```

Contoh lain:

```text
WHEN:
User asks for a technical solution.

BEHAVIOR:
Understand the problem first.
Explain the architecture.
Then provide implementation steps.

AVOID:
Immediately dumping code without understanding the requirement.
```

Behavior Pattern harus dapat ditambah, diubah, dinonaktifkan, dan dihapus melalui Admin Panel.

---

# 8. Memory System

Memory adalah salah satu komponen utama proyek.

Choco AI harus memiliki persistent memory.

Memory tidak boleh bergantung hanya pada conversation history.

Struktur memory harus dibagi menjadi beberapa kategori.

## 8.1 Identity Memory

Informasi identitas Choco.

Contoh:

```text
Name
Nickname
Background
Projects
Skills
Preferences
Important relationships
```

## 8.2 Permanent Memory

Informasi yang memang dimaksudkan untuk bertahan dalam jangka panjang.

Contoh:

```text
Long-term preferences
Important life information
Long-term projects
Stable communication preferences
Important people
Important rules
```

## 8.3 Important Memory

Informasi penting tetapi masih dapat diubah atau dihapus.

## 8.4 Normal Memory

Informasi percakapan yang berguna tetapi tidak selalu harus dipertahankan selamanya.

## 8.5 Temporary Memory

Informasi yang hanya diperlukan untuk konteks sementara.

## 8.6 Conversation History

Riwayat percakapan harus dipisahkan dari memory.

Conversation history:

```text
What was said.
```

Memory:

```text
What should be remembered.
```

Keduanya tidak boleh diperlakukan sebagai hal yang sama.

---

# 9. Memory Management

Administrator harus dapat mengelola memory tanpa menyentuh source code.

Admin Panel harus menyediakan:

* create memory
* edit memory
* delete memory
* search memory
* view memory
* categorize memory
* change memory importance
* archive memory
* restore memory
* bulk delete
* memory statistics

Setiap memory idealnya memiliki metadata:

```text
memory_id
category
content
importance
created_at
updated_at
source
confidence
status
```

---

# 10. Memory Correction

Jika AI memiliki informasi yang salah, Choco harus dapat memperbaikinya.

Contoh:

```text
AI:
[incorrect information]

Choco:
[correct information]

System:
Store correction.
Update relevant memory.
Prevent repeated incorrect behavior.
```

Koreksi harus memiliki jejak perubahan.

Contoh:

```text
Old Value
    ↓
Correction
    ↓
New Value
    ↓
Reason
    ↓
Timestamp
```

---

# 11. Learning From Choco

Sistem harus mempunyai mekanisme untuk mempelajari pola komunikasi Choco.

Learning dalam proyek ini tidak berarti model harus selalu dilatih ulang.

Tahap awal dapat menggunakan:

* system configuration
* structured memory
* retrieval
* behavioral rules
* examples
* correction records
* conversation analysis
* response preferences

Tujuannya adalah membuat AI semakin konsisten dengan Choco.

---

# 12. Example-Based Behavior

Contoh respons nyata Choco merupakan data penting.

Dataset dapat memiliki struktur:

```json
{
  "situation": "...",
  "context": "...",
  "choco_response": "...",
  "behavior_tags": [
    "direct",
    "technical",
    "casual"
  ],
  "notes": "..."
}
```

Dataset tersebut dapat digunakan sebagai behavioral reference.

Semakin banyak contoh berkualitas tinggi yang tersedia, semakin banyak pola komunikasi yang dapat dipelajari sistem.

---

# 13. Correction Loop

Correction Loop adalah mekanisme utama untuk meningkatkan kemiripan.

```text
User
 ↓
AI Response
 ↓
Choco Review
 ↓
Correct / Approve
 ↓
Store Feedback
 ↓
Update Behavior Data
 ↓
Future Response
```

Feedback dapat memiliki beberapa tipe:

```text
CORRECT
INCORRECT
PARTIALLY_CORRECT
STYLE_PROBLEM
FACT_PROBLEM
MISSING_CONTEXT
WRONG_BEHAVIOR
```

---

# 14. Choco Similarity Evaluation

Proyek harus memiliki sistem evaluasi.

Jangan mengatakan:

> "AI sudah 100% mirip."

hanya karena responsnya terasa mirip.

Harus ada pengujian.

Contoh benchmark:

```text
100 situations
    ↓
Choco answers each situation
    ↓
AI answers same situations
    ↓
Compare
    ↓
Analyze differences
```

Kategori evaluasi:

* vocabulary
* sentence structure
* tone
* reasoning pattern
* decision pattern
* humor
* directness
* explanation style
* preference consistency
* memory accuracy
* behavioral consistency

Hasil evaluasi dapat digunakan untuk menentukan bagian mana yang masih berbeda.

---

# 15. Admin Panel

Admin Panel adalah pusat kendali Choco.

Administrator utama adalah Choco.

Admin Panel harus memungkinkan pengelolaan AI tanpa mengubah source code.

## Personality

Admin dapat:

* edit personality
* edit communication style
* add behavior
* remove behavior
* modify preferences
* modify principles
* modify response rules

## Memory

Admin dapat:

* add
* edit
* delete
* search
* categorize
* archive
* restore

## Behavioral Examples

Admin dapat:

* add example
* edit example
* delete example
* classify example
* approve example

## Corrections

Admin dapat:

* view corrections
* modify corrections
* delete corrections
* approve learned behavior

## AI Configuration

Admin dapat mengatur:

* model
* temperature
* context size
* response length
* memory retrieval amount
* system behavior
* fallback behavior

## Security

Admin Panel harus memiliki:

* authentication
* authorization
* protected admin routes
* session management
* secure credentials
* audit logs

---

# 16. Admin Authority

Choco memiliki kontrol tertinggi terhadap konfigurasi AI.

Konsepnya:

```text
Choco
  ↓
Super Admin
  ↓
AI Configuration
  ↓
Personality
Memory
Behavior
Rules
Examples
Corrections
```

AI tidak boleh memiliki kemampuan untuk mengubah aturan inti miliknya sendiri tanpa mekanisme kontrol yang ditentukan administrator.

---

# 17. AI Model Layer

AI Model bertanggung jawab terutama terhadap:

* language generation
* reasoning
* understanding
* contextual response generation

Model bukan tempat utama untuk menyimpan identitas Choco.

Informasi personal harus berada pada sistem konfigurasi dan memory.

Dengan demikian, model dapat diganti tanpa harus membangun ulang seluruh sistem.

---

# 18. Model Independence

Arsitektur harus memungkinkan model AI diganti.

Contoh:

```text
AI Backend
    │
    ├── Model A
    ├── Model B
    ├── Model C
    └── Future Model
```

Personality, memory, behavioral data, dan admin configuration harus tetap dapat digunakan ketika model diganti.

---

# 19. Context Assembly

Sebelum AI menghasilkan respons, sistem harus menyusun konteks.

Contoh:

```text
User Message
      +
Conversation Context
      +
Relevant Memory
      +
Personality Configuration
      +
Behavior Rules
      +
Relevant Examples
      +
Corrections
      ↓
Context Builder
      ↓
AI Model
```

Sistem tidak boleh memasukkan seluruh database ke dalam setiap prompt.

Memory retrieval harus memilih informasi yang relevan.

---

# 20. Retrieval System

Memory retrieval harus mempertimbangkan:

* relevance
* importance
* recency
* relationship
* context
* confidence

Contoh:

Jika user bertanya mengenai sebuah proyek Choco, sistem mengambil memory terkait proyek tersebut, bukan seluruh sejarah hidup Choco. Database bukan tempat untuk membuang segala sesuatu ke blender lalu berharap AI menemukan jawabannya sendiri.

---

# 21. Relationship Memory

Sistem harus dapat memahami hubungan antar-entitas.

Contoh:

```text
Choco
 ├── Project
 │    └── Project A
 │
 ├── Person
 │    └── Person B
 │
 └── Preference
      └── Preference C
```

Relationship memory dapat membantu AI memahami konteks yang lebih kompleks.

---

# 22. Knowledge vs Personality

Sistem harus memisahkan:

### Knowledge

Apa yang diketahui Choco.

### Personality

Bagaimana Choco berkomunikasi.

### Behavior

Bagaimana Choco biasanya bertindak dalam situasi tertentu.

### Preference

Apa yang disukai atau tidak disukai Choco.

### Memory

Apa yang harus diingat.

### Rules

Batasan dan prinsip yang harus diikuti AI.

Pemisahan ini penting agar perubahan satu komponen tidak merusak komponen lain.

---

# 23. Privacy

Data Choco adalah data sensitif secara praktis dan harus diperlakukan dengan hati-hati.

Prinsip utama:

```text
Privacy First
```

Sistem harus:

* data Choco harus diproses dan disimpan secara lokal
* tidak mengirim memory, personality, conversation, atau data pribadi ke cloud
* tidak menggunakan layanan AI eksternal untuk inference
* melindungi credential
* tidak menyimpan secret di repository
* menyediakan penghapusan memory
* menyediakan backup dan restore
* menyediakan audit log
* membatasi akses Admin Panel

---

# 24. Data Ownership

Data harus tetap berada di bawah kendali Choco.

Source code:

```text
Owned by Choco
```

Configuration:

```text
Owned by Choco
```

Memory:

```text
Owned by Choco
```

Behavior dataset:

```text
Owned by Choco
```

Conversation data:

```text
Owned and controlled by Choco
```

Tidak boleh ada ketergantungan desain yang membuat Choco kehilangan akses terhadap data miliknya.

---

# 25. Storage Architecture

Arsitektur awal:

```text
                    ┌──────────────┐
                    │   CHOCO AI   │
                    └──────┬───────┘
                           │
                     Application
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       AI Model Layer             Memory Database
                                      │
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                           Memory  Examples Corrections
```

Database digunakan untuk persistent data.

Application server digunakan untuk logic.

AI model digunakan untuk generation/reasoning.

---
# 26. Proposed Technology Direction

Teknologi dapat berubah selama pengembangan, tetapi infrastruktur aktif saat ini mengikuti pilihan Choco.

Target saat ini:

```text
Source Code + AI Development Collaboration:
GitHub

Application Hosting / Runtime:
Hugging Face Spaces

Frontend:
Admin Panel + Chat Interface, sesuai implementasi aktual

Backend:
Python / compatible backend, sesuai implementasi aktual

AI:
Replaceable model adapter; gunakan model yang benar-benar tersedia dan dikonfigurasi

Database / Persistent Storage:
Belum menetapkan provider database eksternal. Pilihan penyimpanan harus mengikuti kode aktual dan batas persistence Hugging Face Spaces.

Authentication:
Secure admin authentication
```

Render dan Supabase bukan bagian dari infrastruktur aktif saat ini. Jangan menambahkan layanan tersebut kembali tanpa keputusan baru dari Choco.

Pemilihan teknologi harus mempertimbangkan biaya, resource requirements, performance, privacy, maintainability, deployment compatibility, persistence, dan keberlanjutan jangka panjang.

# 27. Zero-Cost Goal

Proyek memiliki target awal:

> **Rp0 development cost whenever technically possible.**

Prioritas:

```text
Free
    ↓
Open Source
    ↓
Local Processing
    ↓
Free Cloud Tier
    ↓
Paid Service only when unavoidable
```

Tidak boleh memasukkan layanan berbayar hanya karena lebih mudah.

Jika suatu komponen membutuhkan pembayaran untuk penggunaan tertentu, sistem harus memiliki fallback atau alternatif yang memungkinkan proyek tetap berjalan sejauh kemampuan teknisnya.

---
# 28. Deployment Concept

Deployment aktif saat ini menggunakan GitHub untuk source code dan kolaborasi pengembangan AI, serta Hugging Face Spaces sebagai tempat menjalankan aplikasi/server yang dipublikasikan.

Gambaran konseptual:

```text
Developer / AI Agents
        │
        ▼
      GitHub
  Source + Version Control
        │
        ▼
Hugging Face Spaces
  Application / Server Runtime
        │
        ├── Personality Engine
        ├── Memory Engine
        ├── Behavior Engine
        ├── Context Engine
        └── AI Model Adapter
                 │
                 ▼
              AI Model
```

Diagram ini menggambarkan arah deployment, bukan klaim bahwa seluruh komponen sudah selesai diimplementasikan.

Jangan mengasumsikan adanya PostgreSQL, Supabase, Render, atau database eksternal lain. Pilihan dan perilaku penyimpanan harus diverifikasi dari kode aktual.

Periksa batas penyimpanan dan persistence Hugging Face Spaces sebelum mengandalkannya untuk memory permanen. File pada filesystem runtime tidak boleh dianggap otomatis permanen setelah restart atau rebuild.

# 29. Security Architecture

Security harus dirancang sejak awal.

Minimum requirements:

* authentication
* authorization
* password hashing
* secure session handling
* HTTPS
* environment variables
* secret management
* SQL injection protection
* input validation
* output handling
* rate limiting
* audit logging
* protected admin endpoints
* database access restrictions

Admin API tidak boleh dapat diakses publik tanpa authentication.

---

# 30. Audit System

Setiap perubahan penting terhadap AI harus dapat dilacak.

Contoh:

```text
Who:
Choco

Action:
Updated personality rule

Before:
...

After:
...

Timestamp:
...

Reason:
...
```

Audit log membantu mengetahui mengapa perilaku AI berubah.

---

# 31. Versioning

Personality dan behavior configuration harus memiliki versi.

Contoh:

```text
Personality v1
Personality v2
Personality v3
```

Jika konfigurasi baru menyebabkan perilaku buruk, administrator harus dapat melakukan rollback.

Hal yang sama berlaku untuk:

* behavior rules
* memory schema
* prompt configuration
* AI configuration

---

# 32. Backup and Restore

Sistem harus memiliki mekanisme backup.

Data yang idealnya dapat dibackup:

```text
Personality
Rules
Memory
Examples
Corrections
Relationships
Configuration
Audit Logs
```

Restore harus diuji, bukan sekadar fitur dekoratif yang hidup di README lalu mati mengenaskan di production.

---

# 33. Failure Handling

Jika AI tidak memiliki informasi yang cukup:

```text
Do not invent personal facts.
```

Jika memory tidak ditemukan:

```text
Do not pretend to remember.
```

Jika terdapat konflik memory:

```text
Detect conflict.
Determine priority.
Use latest approved information when appropriate.
Record uncertainty when necessary.
```

Jika AI model gagal:

```text
Return controlled fallback response.
Log the error.
Do not expose secret information.
```

---

# 34. Hallucination Control

Karena AI dapat menghasilkan informasi yang tidak benar, sistem harus mempunyai kontrol.

Untuk informasi tentang Choco:

```text
Known Fact
    ↓
Memory
    ↓
Confidence
    ↓
Context
    ↓
Response
```

Jika sistem tidak memiliki informasi:

```text
Unknown
```

bukan:

```text
Invented Fact
```

---

# 35. Human Override

Choco harus selalu memiliki kemampuan untuk memperbaiki AI.

Administrator dapat:

```text
Override Response
Override Memory
Override Personality
Override Rule
Override Behavior
Delete Learned Pattern
Rollback Configuration
```

AI tidak boleh menjadi pihak yang memiliki keputusan akhir terhadap representasi dirinya sendiri.

---

# 36. Continuous Improvement

Sistem harus dirancang untuk berkembang.

Loop:

```text
Conversation
     ↓
Observation
     ↓
Feedback
     ↓
Correction
     ↓
Behavior Data
     ↓
Evaluation
     ↓
Configuration Update
     ↓
Improved Response
```

Pengembangan tidak berhenti setelah chatbot pertama berhasil menjawab pesan.

---

# 37. Project Phases

## Phase 0 - Specification

Menentukan:

* identity
* personality
* memory architecture
* behavior system
* admin authority
* security model
* AI model requirements
* database structure

Tidak ada coding sebelum spesifikasi inti jelas.

## Phase 1 - Core Backend

Membangun:

* backend
* database connection
* configuration system
* authentication
* basic AI interface

## Phase 2 - Personality Engine

Membangun:

* personality configuration
* behavior rules
* communication style
* preferences
* principles

## Phase 3 - Memory Engine

Membangun:

* persistent memory
* categories
* retrieval
* editing
* deletion
* importance
* confidence

## Phase 4 - Admin Panel

Membangun:

* dashboard
* personality editor
* memory manager
* behavior manager
* correction manager
* configuration manager

## Phase 5 - Behavioral Learning

Membangun:

* example dataset
* correction loop
* behavioral pattern extraction
* response feedback

## Phase 6 - Evaluation

Membangun:

* benchmark scenarios
* Choco response dataset
* AI response comparison
* consistency testing

## Phase 7 - Security Hardening

Menguji:

* authentication
* authorization
* injection
* secret exposure
* database access
* API abuse
* data leakage

## Phase 8 - Deployment

Menyusun:

* production backend
* database
* frontend
* environment configuration
* monitoring
* backup

## Phase 9 - Continuous Improvement

Secara berkala:

```text
Collect
→ Review
→ Correct
→ Test
→ Update
→ Monitor
```

---

# 38. Project Structure

Struktur awal yang direncanakan:

```text
choco-ai/
│
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config/
│   │   ├── auth/
│   │   ├── ai/
│   │   ├── personality/
│   │   ├── memory/
│   │   ├── behavior/
│   │   ├── corrections/
│   │   ├── context/
│   │   ├── evaluation/
│   │   └── security/
│   │
│   ├── tests/
│   └── requirements.txt
│
├── frontend/
│   ├── admin/
│   └── chat/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── data/
│   └── examples/
│
├── docs/
│   ├── architecture/
│   ├── personality/
│   ├── memory/
│   ├── behavior/
│   ├── security/
│   └── evaluation/
│
└── scripts/
```

Struktur ini dapat berubah setelah kebutuhan teknis diketahui.

---

# 39. Development Rules

Setiap fitur harus melalui:

```text
Goal
↓
Input
↓
Output
↓
Workflow
↓
Dependencies
↓
Error Handling
↓
Security
↓
Compatibility
↓
Files
↓
Tests
↓
Integration
```

Tidak boleh langsung menulis kode tanpa memahami fungsi fitur.

---

# 40. No Dummy Features

Semua fitur yang ditampilkan di UI harus benar-benar bekerja.

Tidak boleh ada:

```text
Coming Soon
```

yang dipasang hanya untuk membuat dashboard terlihat ramai.

Tidak boleh ada tombol:

```text
Learn AI
Improve Personality
Advanced Intelligence
```

yang sebenarnya hanya menjalankan placeholder.

Jika fitur belum siap, fitur tersebut tidak perlu ditampilkan sebagai fitur aktif.

---

# 41. Performance

Sistem harus memperhatikan:

* memory usage
* database queries
* response latency
* model inference cost
* context size
* storage growth
* API usage
* concurrent users

Memory retrieval harus efisien.

Database harus menggunakan indexing yang sesuai.

Conversation history tidak boleh berkembang tanpa batas.

---

# 42. Scalability

Walaupun proyek dimulai kecil, desain harus memungkinkan pertumbuhan.

Target pertumbuhan:

```text
Prototype
   ↓
Personal AI
   ↓
Stable Personal AI
   ↓
Large Personal Knowledge Base
   ↓
Advanced Digital Representation
```

Arsitektur tidak boleh bergantung pada satu file besar yang akhirnya menjadi kuburan bagi developer.

---

# 43. Data Lifecycle

Setiap data harus memiliki lifecycle.

```text
Created
  ↓
Reviewed
  ↓
Active
  ↓
Updated
  ↓
Archived
  ↓
Deleted
```

Tidak semua data harus disimpan selamanya.

Administrator harus dapat mengontrol lifecycle data.

---

# 44. Memory Storage Optimization

Karena storage gratis memiliki batas, sistem harus menghindari penyimpanan yang tidak perlu.

Strategi:

* deduplication
* summarization
* importance scoring
* archival
* cleanup
* compression where appropriate
* conversation pruning
* selective retention

Tujuannya bukan menghapus memori secara sembarangan.

Tujuannya adalah mempertahankan informasi penting dengan penggunaan storage yang efisien.

---

# 45. Personal Knowledge Graph

Tahap lanjutan dapat menggunakan knowledge graph.

Contoh:

```text
Choco
 │
 ├── created → Project A
 │
 ├── knows → Person B
 │
 ├── prefers → Technology C
 │
 └── dislikes → Technology D
```

Knowledge graph dapat membantu AI memahami hubungan antar-informasi.

---

# 46. Advanced Behavioral Modeling

Tahap lanjutan dapat memodelkan:

* response tendencies
* conversational habits
* decision patterns
* context-dependent behavior
* preference conflicts
* emotional language patterns
* humor patterns
* explanation patterns
* disagreement patterns
* correction patterns

Model tidak boleh menyimpulkan atribut sensitif atau membuat klaim psikologis tanpa data dan persetujuan yang sesuai.

---

# 47. AI Representation Levels

Perkembangan sistem dapat dibagi menjadi:

### Level 1

AI mengetahui identitas Choco.

### Level 2

AI mengikuti gaya komunikasi Choco.

### Level 3

AI mengingat informasi Choco.

### Level 4

AI mengikuti aturan dan preferensi Choco.

### Level 5

AI menggunakan contoh perilaku Choco.

### Level 6

AI belajar dari koreksi Choco.

### Level 7

AI mempertahankan konsistensi lintas percakapan.

### Level 8

AI memahami hubungan dan konteks historis.

### Level 9

AI mampu menangani situasi baru berdasarkan pola yang telah dipelajari.

### Level 10

AI menjadi representasi digital Choco yang sangat komprehensif berdasarkan data yang tersedia.

Target proyek adalah terus bergerak menuju Level 10.

---

# 48. What This Project Is Not

Choco AI bukan:

* chatbot generik dengan nama Choco
* chatbot yang hanya menggunakan satu system prompt
* database chat sederhana
* virtual assistant biasa
* aplikasi yang hanya menyimpan conversation history
* AI yang bebas mengubah identitasnya sendiri
* proyek yang mengklaim memiliki kesadaran manusia
* pengganti biologis Choco

Proyek ini adalah sistem software yang membangun **representasi digital berbasis data, aturan, contoh, memori, dan model AI**.

---

# 49. Long-Term Goal

Tujuan jangka panjang adalah membuat Choco AI mampu menerima konteks baru dan menghasilkan respons yang konsisten dengan pola Choco yang telah dipelajari.

```text
                    CHOCO AI
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   Personality      Memory        Behavior
        │              │              │
        └──────────────┼──────────────┘
                       │
                 Context Engine
                       │
                 AI Model Layer
                       │
                Response Engine
                       │
                    Chat
```

Semakin banyak data berkualitas tinggi yang diberikan dan semakin baik sistem melakukan evaluasi serta koreksi, semakin komprehensif representasi digital tersebut dapat berkembang.

---

# 50. Final Project Philosophy

Proyek ini dibangun dengan prinsip:

```text
Accuracy > Speed
Quality > Shortcuts
Functionality > Decoration
Security > Convenience
Privacy > Unnecessary Cloud
Stability > Feature Count
Maintainability > Quick Code
Real Data > Fake Intelligence
Testing > Assumption
Owner Control > Autonomous Modification
```

Target akhirnya bukan sekadar membuat AI yang bisa menjawab.

Target akhirnya adalah membangun sistem yang:

```text
Knows Choco
Understands Choco's communication
Remembers Choco's information
Learns from Choco's examples
Accepts Choco's corrections
Follows Choco's rules
Maintains behavioral consistency
And continuously improves its representation of Choco
```

**Choco AI**

> A continuously evolving digital representation of Choco, built under Choco's control.


---
# 51. Current Deployment Reference for Other AI Agents

Bagian ini adalah acuan deployment untuk AI lain yang ikut mengembangkan AIKEPRIBADIAN. Gunakan kondisi aktual berikut sebagai dasar kerja.

```text
Source Code + AI Development Collaboration:
GitHub

Application / Server Hosting:
Hugging Face Spaces

Database Provider:
Belum ditetapkan sebagai layanan eksternal

Frontend / Backend:
Ikuti struktur dan implementasi aktual dalam repository dan Space

Secrets:
Jangan commit token, password, atau secret ke repository. Gunakan mekanisme secrets platform bila diperlukan.
```

Pembagian tanggung jawab:

```text
GitHub
→ Source code, version control, dan kolaborasi AI development

Hugging Face Spaces
→ Application / server runtime yang dipilih saat ini

AI Model
→ Generation + reasoning, sesuai model yang benar-benar dikonfigurasi

AIKEPRIBADIAN application
→ Identity + Personality + Memory + Behavior +
  Knowledge + Relationships + Context + Corrections
```

**Render dan Supabase tidak digunakan untuk deployment saat ini.** Jangan menambahkan kembali Render, Supabase, atau layanan eksternal lain tanpa keputusan baru dari Choco.

Jangan mengasumsikan bahwa penyimpanan runtime Hugging Face otomatis persisten. Verifikasi konfigurasi Space dan kode aktual sebelum menyatakan memory atau database tersimpan permanen.

Data personal tidak boleh dikirim ke layanan tambahan hanya karena layanan tersebut tersedia. Jika layanan baru diperlukan, jelaskan kebutuhan, data yang dikirim, alasan, dampak keamanan dan privasi, biaya, serta alternatifnya terlebih dahulu.
# 52. Infrastructure Change Policy

Infrastruktur merupakan bagian dari arsitektur proyek dan tidak boleh berubah secara diam-diam.

Infrastruktur aktif saat ini:

* GitHub untuk source code dan kolaborasi pengembangan AI
* Hugging Face Spaces untuk aplikasi/server yang dipublikasikan

Render dan Supabase saat ini tidak digunakan. Perubahan terhadap platform hosting, database, AI provider, authentication, storage, atau deployment architecture harus mendapat keputusan Choco dan dicatat di dokumentasi.

Urutan perubahan:

```text
Identify Need
      ↓
Document Reason
      ↓
Analyze Impact
      ↓
Check Cost
      ↓
Check Privacy
      ↓
Check Security
      ↓
Check Compatibility
      ↓
Implement
      ↓
Test
      ↓
Document
```

Jangan menyamakan layanan gratis dengan resource tanpa batas. Verifikasi batas penggunaan, persistence, dan ketentuan platform ketika deployment dilakukan.

# 53. Historical Conversation Corpus and Choco Modeling

AIKEPRIBADIAN dapat menggunakan **percakapan historis yang tersedia dari akun ChatGPT Choco saat ini** sebagai salah satu sumber utama untuk memahami dan memodelkan Choco.

Tujuan penggunaan korpus ini adalah mengekstraksi pola yang relevan terhadap representasi digital Choco, termasuk identity, personality, communication style, behavioral patterns, preferences, values, decision patterns, recurring interests, project history, contoh respons nyata, corrections, perubahan preferensi, conversational habits, contextual relationships, serta kandidat memory jangka panjang dan jangka pendek.

Sumber percakapan historis diperlakukan sebagai **data observasi**, bukan instruksi mentah yang harus selalu ditiru.

Pipeline yang direncanakan:

Historical Conversations → Collection → Cleaning / Normalization → Identity & Personality Extraction → Behavior Pattern Extraction → Memory Extraction → Example & Correction Extraction → Structured Choco Dataset → Training / Fine-tuning where appropriate + Memory / Rules / Retrieval where appropriate → AIKEPRIBADIAN

Tidak semua informasi dari percakapan harus dimasukkan ke parameter model. Sistem harus menentukan apakah suatu informasi lebih tepat disimpan sebagai Model Training Data, Memory, Personality Configuration, Behavior Rule, Example, Correction, Knowledge, Relationship, atau Evaluation Data.

Korpus percakapan juga harus mempertahankan konteks waktu. Jika pola, preferensi, atau keputusan Choco berubah, perubahan tersebut tidak boleh dihapus hanya untuk membuat dataset terlihat konsisten. Informasi terbaru yang telah dikonfirmasi dapat menjadi representasi aktif, sementara sejarah perubahan dapat dipertahankan sebagai data historis bila relevan.

## 53.1 Role of ChatGPT / Chici

ChatGPT / Chici dapat digunakan sebagai **development and training assistant** untuk membantu membaca dan menganalisis data percakapan yang tersedia, mengidentifikasi pola komunikasi, mengekstraksi personality yang didukung data, menyusun memory records, membuat behavioral examples, membuat correction datasets, merancang schema dan logic, menulis dan menguji kode, mengevaluasi respons AIKEPRIBADIAN terhadap respons Choco, menemukan ketidaksesuaian perilaku, membantu menyusun training / fine-tuning dataset, serta melakukan review terhadap arsitektur dan implementasi.

ChatGPT / Chici bukan penyimpanan permanen AIKEPRIBADIAN. Hasil analisis harus diubah menjadi **data, kode, konfigurasi, dataset, atau artefak proyek yang dapat disimpan dan digunakan oleh sistem AIKEPRIBADIAN sendiri**.

## 53.2 Source Boundary

AIKEPRIBADIAN hanya boleh menggunakan percakapan yang memang tersedia atau diberikan untuk proses pengembangan. Sistem tidak boleh mengklaim memiliki akses terhadap seluruh riwayat akun ChatGPT secara otomatis apabila data tersebut belum tersedia bagi proses pengembangan.

Jika arsip percakapan atau data tambahan diberikan kemudian, data tersebut dapat menjadi bagian dari corpus setelah melalui proses pengolahan dan validasi.

## 53.3 Training Philosophy

Target proyek bukan membuat model menghafal seluruh percakapan Choco. Targetnya adalah membuat sistem memperoleh **representasi perilaku Choco yang semakin komprehensif**.

Prioritas utama:

* Real Conversation Data > Synthetic Assumption
* Observed Behavior > Generic Persona Description
* Verified Correction > Unverified Guess
* Current Approved Information > Outdated Information

Training, memory, rules, retrieval, dan evaluation harus digunakan sebagai komponen yang saling melengkapi.

---

# 54. Current Model Strategy

Model AI diperlakukan sebagai komponen yang dapat diganti.

Untuk tahap pengujian awal, proyek dapat mengevaluasi model lokal kecil yang kompatibel dengan hardware target Choco. Salah satu kandidat yang sedang dipertimbangkan adalah **Qwen3-0.6B dalam quantization Q4**, dengan ukuran model pada kelas ratusan megabyte.

Model tersebut bukan representasi Choco dengan sendirinya.

AIKEPRIBADIAN Core → Identity + Personality + Memory + Behavior + Knowledge + Examples + Corrections + Evaluation → Model Adapter → Local AI Model

Model dapat diganti tanpa menghapus dataset dan representasi Choco yang telah dibangun.

Pemilihan model final harus berdasarkan hasil pengujian nyata pada hardware target, termasuk model size, RAM usage, inference speed, Indonesian language quality, instruction following, reasoning quality, personality consistency, context handling, dan stability.

Tidak ada model yang dianggap final hanya berdasarkan parameter count atau popularitasnya.

---

# 55. AIKEPRIBADIAN Training Team

Pengembangan representasi Choco dilakukan sebagai kerja bersama antara Choco dan AI development agents.

Pembagian fungsi dapat mencakup:

* **Choco** → Owner, source of truth, final correction
* **ChatGPT / Chici** → Architecture, analysis, coding, dataset engineering, evaluation, personality modeling
* **Other AI agents** → Independent analysis, review, dataset work, testing, dan cross-checking
* **AIKEPRIBADIAN** → Final system being built and evaluated

**Choco tetap menjadi sumber kebenaran utama mengenai dirinya sendiri.**

AI agents tidak boleh mengarang sifat, pengalaman, preferensi, memory, atau keputusan Choco hanya untuk mengisi kekosongan dataset.

Jika data tidak cukup, statusnya harus **Unknown**, bukan invented Choco fact.

---

# 56. Conversation-to-Representation Pipeline

Pipeline jangka panjang:

Historical Conversations → Extract → Classify → Validate → Structure → Store → Train / Retrieve / Apply → Generate Response → Compare With Choco → Correction → Dataset Update → Evaluation → Improved Representation

Pipeline ini merupakan salah satu mekanisme utama untuk mengembangkan AIKEPRIBADIAN dari chatbot personal menjadi representasi digital Choco yang semakin komprehensif.

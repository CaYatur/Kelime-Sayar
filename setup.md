## Installation / Setup

1. Clone the repository:
   ```
   git clone https://github.com/CaYatur/Kelime-Sayar.git
   cd Kelime-Sayar
   ```

2. Download the large English dictionary file (Required – uses Git LFS!):
   ```
   # Install Git LFS if you haven't already (one-time setup)
   git lfs install

   # Pull all LFS files (recommended and easiest)
   git lfs pull
   ```

   Or pull only the specific dictionary file:
   ```
   git lfs pull --include="CaYaKelimeSayar-EN/CaYaKelimeSayarOda/Dictionary/dictionary-English.jsonl.bz2"
   ```

   **Important Note**:  
   You must run `git lfs pull` after cloning!  
   If you skip this step, the dictionary file will be just a small placeholder (~132 bytes) and the game will not be able to validate words or function properly.

   After running this command, make sure the downloaded file is located in its original directory:
   CaYaKelimeSayar-EN/CaYaKelimeSayarOda/Dictionary/
 Do not move the file to another location. The game expects the dictionary file to be in this exact folder.

3. Install dependencies (adjust based on your tech stack):
   ```
   # Node.js backend (example):
   npm install
   ```

4. Run the project:
   ```
   # Node.js example:
   node server.js
   # or
   npm start
   ```

**Troubleshooting Git LFS**:  
If you get errors, make sure Git LFS is installed: https://git-lfs.com  
You can also manually download the .bz2 file and place it in the correct path, but `git lfs pull` is the recommended way.


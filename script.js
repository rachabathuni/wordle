
/* Wordle clone — vanilla JS, no backend.
   - Uses ANSWER_WORDS and ALLOWED_WORDS from words.js (generated from uploads)
   - Mobile-first UI with on-screen keyboard
   - Hard Mode toggle (locked after first guess)
*/

(() => {
  const ROWS = 6, COLS = 5;
  const FLIP_MS = (window.WORDLE_CONFIG && window.WORDLE_CONFIG.flipMs) || 300;
  const HINT_MS = (window.WORDLE_CONFIG && window.WORDLE_CONFIG.hintMs) || 2000;
  document.documentElement.style.setProperty('--flip-duration', FLIP_MS + 'ms');
  const boardEl = document.getElementById('board');
  const kbRows = [
    "QWERTYUIOP",
    "ASDFGHJKL",
    "ENTERZXCVBNMBACK"
  ];
  const toastEl = document.getElementById('toast');
  const hardModeInput = document.getElementById('hardMode');
  const resultDialog = document.getElementById('resultDialog');
  const resultTitle = document.getElementById('resultTitle');
  const resultSubtitle = document.getElementById('resultSubtitle');
  const answerReveal = document.getElementById('answerReveal');
  const playAgain = document.getElementById('playAgain');
  const newGameBtn = document.getElementById('newGameBtn');
  const hintBtn = document.getElementById('hintBtn');
  const hintTooltip = document.getElementById('hintTooltip');
  const ALL_WORDS = Array.from(new Set([...ANSWER_WORDS, ...ALLOWED_WORDS]));

  // Game state
  let answer = chooseAnswer();
  let row = 0, col = 0;
  let grid = Array.from({length: ROWS}, () => Array(COLS).fill(""));
  // Hard mode knowledge
  const fixedPos = Array(COLS).fill(null); // greens per position
  const bannedPos = {}; // letter -> Set(positions) for yellow positions
  const minCounts = {}; // letter -> minimal known count from hints
  const absentLetters = new Set(); // letters confirmed absent from the answer
  let modeLocked = false;
  let finished = false;
  let hintHideTimeout;

  // Build board
  for (let r = 0; r < ROWS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    rowEl.dataset.row = r;
    for (let c = 0; c < COLS; c++) {
      const t = document.createElement('div');
      t.className = 'tile';
      t.dataset.row = r;
      t.dataset.col = c;
      rowEl.appendChild(t);
    }
    boardEl.appendChild(rowEl);
  }

  // Build keyboard
  const kbRowEls = document.querySelectorAll('.kb-row');
  const labels = [
    kbRows[0].split(''),
    kbRows[1].split(''),
    [] // third row we'll push ENTER .. M .. BACK
  ];
  "ENTER".split('').forEach(()=>{}); // noop: for clarity
  const row3 = ["ENTER", ..."ZXCVBNM".split(''), "BACK"];
  [labels[0], labels[1], row3].forEach((arr, idx) => {
    const container = kbRowEls[idx];
    arr.forEach(ch => {
      const key = document.createElement('button');
      key.className = 'key';
      key.setAttribute('aria-label', ch);
      key.dataset.key = ch;
      key.textContent = (ch === "BACK") ? "⌫" : (ch === "ENTER" ? "ENTER" : ch);
      if (ch === "BACK" || ch === "ENTER") key.classList.add('wide');
      key.addEventListener('click', () => handleKey(ch));
      container.appendChild(key);
    });
  });

  // Input handlers
  window.addEventListener('keydown', (e) => {
    if (finished) return;
    if (e.key === 'Backspace') return handleKey('BACK');
    if (e.key === 'Enter') return handleKey('ENTER');
    const k = e.key.toUpperCase();
    if (/^[A-Z]$/.test(k)) handleKey(k);
  });

  hintBtn.addEventListener('click', () => {
    if (finished) return;
    if (hintTooltip.classList.contains('show')) return;
    const word = generateHintWord();
    if (!word){
      showToast("No hints available");
      return;
    }
    hintTooltip.textContent = word.toUpperCase();
    hintTooltip.classList.add('show');
    clearTimeout(hintHideTimeout);
    hintHideTimeout = setTimeout(() => hintTooltip.classList.remove('show'), HINT_MS);
  });

  newGameBtn.addEventListener('click', () => resetGame());
  playAgain.addEventListener('click', () => {
    resultDialog.close();
    resetGame();
  });

  function resetGame(){
    answer = chooseAnswer();
    row = 0; col = 0; finished = false;
    modeLocked = false;
    Object.keys(minCounts).forEach(k=>delete minCounts[k]);
    for (let i=0;i<COLS;i++) fixedPos[i] = null;
    for (const k of Object.keys(bannedPos)) delete bannedPos[k];
    absentLetters.clear();
    // clear tiles
    document.querySelectorAll('.row').forEach(r => r.classList.remove('shake'));
    document.querySelectorAll('.tile').forEach(t => {
      t.className = 'tile';
      t.textContent = '';
    });
    // reset keyboard
    document.querySelectorAll('.key').forEach(k => {
      k.classList.remove('absent','present','correct');
    });
    // re-enable hard mode toggle
    hardModeInput.disabled = false;
    hintTooltip.classList.remove('show');
    clearTimeout(hintHideTimeout);
    showToast("New game started");
  }

  function chooseAnswer(){
    if (!Array.isArray(ANSWER_WORDS) || ANSWER_WORDS.length === 0){
      console.warn("ANSWER_WORDS missing or empty; falling back to ALLOWED_WORDS");
      return (ALLOWED_WORDS[Math.floor(Math.random()*ALLOWED_WORDS.length)] || "about");
    }
    return ANSWER_WORDS[Math.floor(Math.random()*ANSWER_WORDS.length)];
  }

  function handleKey(k){
    if (finished) return;
    if (!modeLocked && (row > 0 || col > 0)) {
      modeLocked = true;
      hardModeInput.disabled = true;
    }
    if (k === 'BACK'){
      if (col > 0){
        col--;
        grid[row][col] = "";
        paintTile(row,col,"");
      }
      return;
    }
    if (k === 'ENTER'){
      submitGuess();
      return;
    }
    if (/^[A-Z]$/.test(k) && col < COLS){
      grid[row][col] = k.toLowerCase();
      paintTile(row,col,grid[row][col], true);
      col++;
    }
  }

  function paintTile(r,c,val,filled=false){
    const tile = tileAt(r,c);
    tile.textContent = val.toUpperCase();
    tile.classList.toggle('filled', !!filled && !!val);
  }
  function tileAt(r,c){
    return document.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
  }

  function submitGuess(){
    if (col < COLS){
      shakeRow(row);
      return showToast("Not enough letters");
    }
    const guess = grid[row].join("");
    if (!isAllowed(guess)){
      shakeRow(row);
      return showToast("Not in word list");
    }
    if (hardModeInput.checked){
      const ok = validateHardMode(guess);
      if (!ok) return;
    }
    // Score
    const score = scoreGuess(guess, answer);
    // Update knowledge for hard mode
    updateKnowledge(guess, score);
    // Animate row reveal
    revealRow(row, score).then(() => {
      if (guess === answer){
        finished = true;
        showResult(true, row+1);
      } else if (row === ROWS-1){
        finished = true;
        showResult(false, null);
      } else {
        row++; col=0;
      }
    });
  }

  function isAllowed(w){
    return ALLOWED_WORDS.includes(w) || ANSWER_WORDS.includes(w);
  }

  function validateHardMode(guess){
    // Greens must be fixed
    for (let i=0;i<COLS;i++){
      if (fixedPos[i] && guess[i] !== fixedPos[i]){
        shakeRow(row);
        showToast(`Hard Mode: position ${i+1} must be '${fixedPos[i].toUpperCase()}'`);
        return false;
      }
    }
    // Yellows cannot be in banned positions
    for (const [ch, posSet] of Object.entries(bannedPos)){
      for (const p of posSet){
        if (guess[p] === ch){
          shakeRow(row);
          showToast(`Hard Mode: '${ch.toUpperCase()}' cannot be at position ${p+1}`);
          return false;
        }
      }
    }
    // Minimal counts
    const counts = {};
    for (const ch of guess) counts[ch] = (counts[ch]||0)+1;
    for (const [ch, n] of Object.entries(minCounts)){
      if ((counts[ch]||0) < n){
        shakeRow(row);
        showToast(`Hard Mode: include ${n}× '${ch.toUpperCase()}'`);
        return false;
      }
    }
    return true;
  }

  function scoreGuess(guess, ans){
    // Two-pass: first greens, then presents based on remaining counts
    const res = Array(COLS).fill('absent');
    const counts = {};
    for (const ch of ans){
      counts[ch] = (counts[ch]||0) + 1;
    }
    // Greens
    for (let i=0;i<COLS;i++){
      if (guess[i] === ans[i]){
        res[i] = 'correct';
        counts[guess[i]]--;
      }
    }
    // Yellows
    for (let i=0;i<COLS;i++){
      if (res[i] !== 'correct'){
        const ch = guess[i];
        if (counts[ch] > 0){
          res[i] = 'present';
          counts[ch]--;
        }
      }
    }
    return res;
  }

  function updateKnowledge(guess, score){
    // For greens: fix position and increment min count
    const seen = {}; // per-letter occurrences in this guess that are not 'absent'
    for (let i=0;i<COLS;i++){
      const ch = guess[i];
      if (score[i] === 'correct'){
        fixedPos[i] = ch;
        seen[ch] = (seen[ch]||0)+1;
      }
    }
    // Yellows: ban that position and increment seen
    for (let i=0;i<COLS;i++){
      const ch = guess[i];
      if (score[i] === 'present'){
        if (!bannedPos[ch]) bannedPos[ch] = new Set();
        bannedPos[ch].add(i);
        seen[ch] = (seen[ch]||0)+1;
      }
    }
    // Update minimal counts and clear absents
    for (const [ch, n] of Object.entries(seen)){
      minCounts[ch] = Math.max(minCounts[ch]||0, n);
      absentLetters.delete(ch);
    }
    // Mark absent letters
    for (let i=0;i<COLS;i++){
      const ch = guess[i];
      if (score[i] === 'absent' && !minCounts[ch]){
        absentLetters.add(ch);
      }
    }
  }

  function revealRow(r, score){
    return new Promise((resolve) => {
      const tiles = Array.from(document.querySelectorAll(`.tile[data-row="${r}"]`));
      tiles.forEach((t, i) => {
        setTimeout(() => {
          t.classList.add('reveal', score[i]);
          updateKeyColor(grid[r][i], score[i]);
          if (i === tiles.length - 1) {
            // Wait for the final tile's flip animation to finish
            setTimeout(resolve, FLIP_MS);
          }
        }, i * FLIP_MS);
      });
    });
  }

  function updateKeyColor(letter, cls){
    const key = document.querySelector(`.key[data-key="${letter.toUpperCase()}"]`);
    if (!key) return;
    const precedence = { absent: 0, present: 1, correct: 2 };
    const current = key.classList.contains('correct') ? 'correct' :
      key.classList.contains('present') ? 'present' :
      key.classList.contains('absent') ? 'absent' : null;
    if (!current || precedence[cls] > precedence[current]){
      key.classList.remove('absent','present','correct');
      key.classList.add(cls);
    }
  }

  function shakeRow(r){
    const rowEl = document.querySelector(`.row[data-row="${r}"]`);
    rowEl.classList.remove('shake');
    // trigger reflow
    void rowEl.offsetWidth;
    rowEl.classList.add('shake');
  }

  let toastTimeout;
  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  function showResult(win, guesses){
    resultTitle.textContent = win ? "You got it!" : "Better luck next time";
    resultSubtitle.textContent = win
      ? `Solved in ${guesses} ${guesses===1?'guess':'guesses'}. The word was:`
      : "The correct word was:";
    answerReveal.textContent = answer.toUpperCase();
    if (!resultDialog.open) resultDialog.showModal();
  }

  // Hint generation (algorithm is modular for easy tweaking)
  const STARTER_WORDS = ['irate','arise','raise','adieu','aisle'];

  function generateHintWord(){
    if (row === 0 && col === 0){
      return STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)];
    }
    const tried = new Set();
    for (let r=0; r<row; r++) tried.add(grid[r].join(""));
    const candidates = ALL_WORDS.filter(w => !tried.has(w) && satisfiesKnowledge(w));
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
    }

  function satisfiesKnowledge(word){
    for (const ch of absentLetters){
      if (word.includes(ch)) return false;
    }
    for (let i=0;i<COLS;i++){
      if (fixedPos[i] && word[i] !== fixedPos[i]) return false;
    }
    for (const [ch, posSet] of Object.entries(bannedPos)){
      for (const p of posSet){
        if (word[p] === ch) return false;
      }
    }
    const counts = {};
    for (const ch of word) counts[ch] = (counts[ch]||0)+1;
    for (const [ch, n] of Object.entries(minCounts)){
      if ((counts[ch]||0) < n) return false;
    }
    return true;
  }

  // Expose for debugging
  window.__wordle = { get answer(){return answer}, set answer(v){answer=v} };

  // Assigning any value to REVEAL_ANSWER in the console prints the current answer.
  Object.defineProperty(window, 'REVEAL_ANSWER', {
    configurable: true,
    set(v){
      console.log(`Wordle answer: ${answer.toUpperCase()}`);
    }
  });
})();

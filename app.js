// --- DOM Elements ---
const screenDb = document.getElementById('db-screen');
const screenSetup = document.getElementById('setup-screen');
const screenCard = document.getElementById('flashcard-screen');

const dbUpload = document.getElementById('db-upload');
const dbStatus = document.getElementById('db-status');
const daySelect = document.getElementById('day-select');
const inputStart = document.getElementById('start-index');
const inputEnd = document.getElementById('end-index');

// Card Elements
const flashcard = document.getElementById('flashcard');
const progressText = document.getElementById('progress-text');
const elId = document.getElementById('card-id');
const elWord = document.getElementById('card-word');
const elPos = document.getElementById('card-pos');
const elIpa = document.getElementById('card-ipa');
const elMeaning = document.getElementById('card-meaning');
const elExamples = document.getElementById('card-examples');

// --- Biến toàn cục ---
let vocabData = {};
let currentSessionWords = [];
let currentIndex = 0;
const WORDS_PER_DAY = 100;

// ==========================================
// 1. ĐỌC FILE DATABASE SQLITE BẰNG SQL.JS
// ==========================================
dbUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    dbStatus.textContent = "Đang xử lý dữ liệu...";

    try {
        // Khởi tạo sql.js
        const sqlPromise = initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        // Đọc file dạng ArrayBuffer
        const dataPromise = file.arrayBuffer();

        const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);

        // Load DB vào bộ nhớ
        const db = new SQL.Database(new Uint8Array(buf));

        // Truy vấn dữ liệu từ vựng (Sắp xếp A-Z giống App Python của bạn)
        const res = db.exec("SELECT word, part_of_speech, meaning, ipa_us, examples FROM vocabulary ORDER BY word COLLATE NOCASE ASC");

        if (res.length > 0) {
            parseDatabaseToWebFormat(res[0].values);
            dbStatus.textContent = "✅ Tải thành công!";
            setTimeout(initSetupScreen, 500); // Chuyển sang màn hình setup
        } else {
            dbStatus.textContent = "❌ DB trống hoặc lỗi cấu trúc!";
        }
    } catch (error) {
        console.error(error);
        dbStatus.textContent = "❌ Lỗi: " + error.message;
    }
});

function parseDatabaseToWebFormat(rows) {
    vocabData = {};
    rows.forEach((row, index) => {
        const rank = index + 1;
        const dayNum = Math.floor((rank - 1) / WORDS_PER_DAY) + 1;

        if (!vocabData[dayNum]) vocabData[dayNum] = [];

        let examples = [];
        try { if (row[4]) examples = JSON.parse(row[4]); } catch(e) {}

        // [ĐÃ SỬA]: Đổi .append() thành .push() của JavaScript
        vocabData[dayNum].push({
            id: rank,
            word: row[0],
            pos: row[1],
            meaning: row[2],
            ipa: row[3],
            examples: examples
        });
    });
}
// ==========================================
// 2. LOGIC CẤU HÌNH & FLASHCARD
// ==========================================
function initSetupScreen() {
    screenDb.classList.remove('active');
    screenSetup.classList.add('active');

    daySelect.innerHTML = "";
    const days = Object.keys(vocabData).sort((a, b) => Number(a) - Number(b));
    days.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = `Day ${day} (${vocabData[day].length} từ)`;
        daySelect.appendChild(option);
    });

    // Khôi phục lịch sử từ LocalStorage
    const savedDay = localStorage.getItem('learn_day');
    const savedStart = localStorage.getItem('learn_start');
    const savedEnd = localStorage.getItem('learn_end');

    if (savedDay && vocabData[savedDay]) daySelect.value = savedDay;
    inputStart.value = savedStart || 1;
    inputEnd.value = savedEnd || 10;
}

document.getElementById('btn-start').addEventListener('click', () => {
    const day = daySelect.value;
    const start = parseInt(inputStart.value) || 1;
    const end = parseInt(inputEnd.value) || 10;

    localStorage.setItem('learn_day', day);
    localStorage.setItem('learn_start', start);
    localStorage.setItem('learn_end', end);

    const dayData = vocabData[day] || [];
    currentSessionWords = dayData.slice(start - 1, end);

    if (currentSessionWords.length === 0) {
        alert("Phạm vi không hợp lệ! Vui lòng chọn lại.");
        return;
    }

    currentIndex = 0;
    screenSetup.classList.remove('active');
    screenCard.classList.add('active');
    renderCard();
});

document.getElementById('btn-back').addEventListener('click', () => {
    screenCard.classList.remove('active');
    screenSetup.classList.add('active');
    flashcard.classList.remove('flipped');
});

flashcard.addEventListener('click', (e) => {
    if (e.target.id !== 'btn-speak') flashcard.classList.toggle('flipped');
});

function renderCard() {
    flashcard.classList.remove('flipped');
    const wordObj = currentSessionWords[currentIndex];
    progressText.textContent = `${currentIndex + 1} / ${currentSessionWords.length}`;

    elId.textContent = `Day ${daySelect.value} #${wordObj.id}`;
    elWord.textContent = wordObj.word;
    elPos.textContent = wordObj.pos ? `(${wordObj.pos})` : "";
    elIpa.textContent = wordObj.ipa ? `/${wordObj.ipa.replace(/\//g, '')}/` : "";
    elMeaning.textContent = wordObj.meaning;

    elExamples.innerHTML = "";
    if (wordObj.examples && wordObj.examples.length > 0) {
        wordObj.examples.slice(0, 3).forEach(ex => {
            const p = document.createElement('p');
            p.textContent = ex;
            elExamples.appendChild(p);
        });
    }
}

document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentIndex > 0) { currentIndex--; renderCard(); }
});

document.getElementById('btn-next').addEventListener('click', () => {
    if (currentIndex < currentSessionWords.length - 1) { currentIndex++; renderCard(); }
    else { alert("Chúc mừng bạn đã học xong phiên này!"); }
});

document.getElementById('btn-speak').addEventListener('click', () => {
    const wordObj = currentSessionWords[currentIndex];
    const utterance = new SpeechSynthesisUtterance(wordObj.word);
    utterance.lang = 'en-US'; utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
});

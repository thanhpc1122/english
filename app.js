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
// --- Element mới cho Quiz ---
const screenQuiz = document.getElementById('quiz-screen');
const modeSelect = document.getElementById('mode-select');
const elQuizProgress = document.getElementById('quiz-progress-text');
const elQuizId = document.getElementById('quiz-id');
const elQuizQuestion = document.getElementById('quiz-question');
const elQuizOptions = document.getElementById('quiz-options');
const btnQuizNext = document.getElementById('btn-quiz-next');

// Biến cho Quiz & IndexedDB
let currentMode = 'flashcard'; // flashcard, quiz_en_vi, quiz_vi_en
let currentQuizCorrect = null;
const DB_NAME = "VocabOfflineDB";

// ==========================================
// 0. INDEXEDDB: TỰ ĐỘNG LƯU & TẢI DATABASE
// ==========================================
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains('files')) {
                e.target.result.createObjectStore('files');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadDBFromLocal() {
    try {
        const db = await openDB();
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get('sqlite_db');
        req.onsuccess = async () => {
            if (req.result) {
                dbStatus.textContent = "Đang tải dữ liệu đã lưu...";
                const sqlPromise = initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` });
                const SQL = await sqlPromise;
                const sqliteDb = new SQL.Database(new Uint8Array(req.result));
                const res = sqliteDb.exec("SELECT word, part_of_speech, meaning, ipa_us, examples FROM vocabulary ORDER BY word COLLATE NOCASE ASC");
                if (res.length > 0) {
                    parseDatabaseToWebFormat(res[0].values);
                    dbStatus.textContent = "✅ Tải thành công từ bộ nhớ!";
                    setTimeout(initSetupScreen, 500);
                }
            }
        };
    } catch (e) { console.log("Chưa có DB lưu trữ."); }
}
document.addEventListener("DOMContentLoaded", loadDBFromLocal);

// Thêm sự kiện nút Toàn màn hình
document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => {});
    else document.exitFullscreen();
});
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

        // --- DÒNG CODE MỚI ĐƯỢC THÊM VÀO ĐỂ LƯU FILE ---
        try {
            const idb = await openDB();
            const tx = idb.transaction('files', 'readwrite');
            tx.objectStore('files').put(buf, 'sqlite_db');
        } catch(err) { console.error("Lỗi lưu DB:", err); }
        // ----------------------------------------------

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
    currentMode = modeSelect.value;

    localStorage.setItem('learn_day', day);
    localStorage.setItem('learn_start', start);
    localStorage.setItem('learn_end', end);
    localStorage.setItem('learn_mode', currentMode); // Lưu thêm chế độ học

    const dayData = vocabData[day] || [];
    currentSessionWords = dayData.slice(start - 1, end);

    if (currentSessionWords.length === 0) {
        alert("Phạm vi không hợp lệ! Vui lòng chọn lại.");
        return;
    }

    currentIndex = 0;
    screenSetup.classList.remove('active');

    if (currentMode === 'flashcard') {
        screenCard.classList.add('active');
        renderCard();
    } else {
        screenQuiz.classList.add('active');
        renderQuiz();
    }
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

// ==========================================
// 3. LOGIC TRẮC NGHIỆM (QUIZ)
// ==========================================
document.getElementById('btn-quiz-back').addEventListener('click', () => {
    screenQuiz.classList.remove('active');
    screenSetup.classList.add('active');
});

function renderQuiz() {
    btnQuizNext.style.display = 'none';
    const wordObj = currentSessionWords[currentIndex];
    elQuizProgress.textContent = `${currentIndex + 1} / ${currentSessionWords.length}`;
    elQuizId.textContent = `Day ${daySelect.value} #${wordObj.id}`;

    let questionText, correctText;
    if (currentMode === 'quiz_en_vi') {
        questionText = `${wordObj.word} ${wordObj.pos ? `(${wordObj.pos})` : ''}`;
        correctText = wordObj.meaning;
    } else {
        questionText = wordObj.meaning;
        correctText = wordObj.word;
    }

    elQuizQuestion.textContent = questionText;
    currentQuizCorrect = correctText;

    // Sinh 3 đáp án sai ngẫu nhiên từ toàn bộ ngày hiện tại
    const currentDayData = vocabData[daySelect.value];
    let distractors = [];
    while (distractors.length < 3 && distractors.length < currentDayData.length - 1) {
        const randomWord = currentDayData[Math.floor(Math.random() * currentDayData.length)];
        const distractorText = currentMode === 'quiz_en_vi' ? randomWord.meaning : randomWord.word;
        if (distractorText !== correctText && !distractors.includes(distractorText)) {
            distractors.push(distractorText);
        }
    }

    // Trộn đáp án
    const options = [correctText, ...distractors];
    options.sort(() => Math.random() - 0.5);

    // Render nút
    elQuizOptions.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'btn-option';
        btn.textContent = opt;
        btn.addEventListener('click', () => handleQuizAnswer(btn, opt === correctText));
        elQuizOptions.appendChild(btn);
    });
}

function handleQuizAnswer(clickedBtn, isCorrect) {
    // Khóa tất cả các nút
    const allBtns = elQuizOptions.querySelectorAll('.btn-option');
    allBtns.forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === currentQuizCorrect) {
            btn.classList.add('correct'); // Luôn hiện đáp án đúng
        }
    });

    if (!isCorrect) {
        clickedBtn.classList.add('wrong');
    }

    btnQuizNext.style.display = 'block';
}

btnQuizNext.addEventListener('click', () => {
    if (currentIndex < currentSessionWords.length - 1) {
        currentIndex++;
        renderQuiz();
    } else {
        alert("🎉 Chúc mừng bạn đã hoàn thành bài kiểm tra!");
        screenQuiz.classList.remove('active');
        screenSetup.classList.add('active');
    }
});

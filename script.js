const axios = require('axios');
const fs = require('fs');
const clipboardy = require('clipboardy');
const readline = require('readline');
const path = require('path');

const hsk1_characters = [];

function processInput(input, existingList) {
  const parts = input.split(',');
  parts.forEach(part => {
    const trimmed = part.trim().replace(/['"]/g, ''); // убираем кавычки
    // каждый символ отдельно
    for (const c of trimmed) {
      if (/[\u4e00-\u9fa5]/.test(c) && !existingList.includes(c)) {
        existingList.push(c);
      }
    }
  });
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function askQuestionsAndProcess() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  let inputLines = [];
  console.log('Введите список иероглифов (для окончания ввода оставьте строку пустой):');

  for await (const line of rl) {
    if (line.trim() === '') break;
    inputLines.push(line);
  }
  rl.close();

  const combinedInput = inputLines.join('\n');
  processInput(combinedInput, hsk1_characters);
}

async function getDownloadLink(character) {
  const search_url = 'https://www.strokeorder.com/chinese/';
  try {
    const response = await axios.get(search_url + character, {
      timeout: 10000
    });
    const html = response.data;
    const divRegex = /<div class="stroke-article-download">([\s\S]*?)<\/div>/i;
    const divMatch = html.match(divRegex);
    if (divMatch) {
      const divContent = divMatch[1];
      const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>.*?<\/a>/i;
      const linkMatch = divContent.match(linkRegex);
      if (linkMatch) {
        let downloadLink = linkMatch[1];
        if (downloadLink.startsWith('/')) {
          downloadLink = 'https://www.strokeorder.com' + downloadLink;
        }
        return downloadLink;
      } else {
        console.log(`Ссылка внутри <div> не найдена для ${character}`);
        return null;
      }
    } else {
      console.log(`<div class="stroke-article-download"> не найден для ${character}`);
      return null;
    }
  } catch (error) {
    console.error(`Ошибка при запросе для ${character}:`, error.message);
    return null;
  }
}

async function downloadFile(url, filepath) {
  const writer = fs.createWriteStream(filepath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

(async () => {
  // Спрашиваем пользователя что делать
  const choice = await askQuestion('Выберите действие:\n1 - Получить ссылки\n2 - Скачать все файлы в папку files\n3 - И то и другое\nВведите 1, 2 или 3: ');
  const action = choice.trim();

  await askQuestionsAndProcess();

  const search_url = 'https://www.strokeorder.com/chinese/';
  const results = [];

  if (action === '1' || action === '3') {
    // Получение ссылок
    for (const char of hsk1_characters) {
      console.log(`Обрабатываем ${char}...`);
      const link = await getDownloadLink(char);
      if (link) {
        results.push({ character: char, download_link: link });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Сохраняем результаты
    fs.writeFileSync('hsk1_links.json', JSON.stringify(results, null, 2), 'utf-8');
    console.log("Ссылки сохранены в 'hsk1_links.json'.");
    const linksText = results.map(r => r.download_link).join('\n');
    clipboardy.writeSync(linksText);
    console.log('Все ссылки скопированы в буфер обмена!');
  }

  if (action === '2' || action === '3') {
    // Создаем папку files, если не существует
    const dir = path.join(__dirname, 'files');
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }
    // Обрабатываем скачивание
    for (const char of hsk1_characters) {
      console.log(`Обрабатываем ${char}...`);
      const link = await getDownloadLink(char);
      if (link) {
        const filename = `${char}.pdf`; // или другой формат, если известно
        const filepath = path.join(dir, filename);
        // Проверяем, существует ли файл
        if (fs.existsSync(filepath)) {
          console.log(`Файл для ${char} уже существует, пропускаем скачивание.`);
        } else {
          try {
            await downloadFile(link, filepath);
            console.log(`Скачан ${char} в ${filepath}`);
          } catch (err) {
            console.error(`Ошибка скачивания ${char}:`, err.message);
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('Процесс скачивания завершен.');
  }

  if (action !== '1' && action !== '2' && action !== '3') {
    console.log('Недопустимый выбор. Завершение.');
  }
})();

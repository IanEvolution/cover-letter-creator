// Resume upload and parsing logic
let resumeText = '';
const resumeUpload = document.getElementById('resumeUpload');
resumeUpload.addEventListener('change', async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const fileType = file.name.split('.').pop().toLowerCase();
  document.getElementById('output').innerText = 'Extracting resume text...';
  if (fileType === 'pdf') {
    // Set the worker source for pdf.js
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
    // PDF extraction using pdf.js
    const reader = new FileReader();
    reader.onload = async function() {
      const typedarray = new Uint8Array(reader.result);
      const pdf = await window.pdfjsLib.getDocument({data: typedarray}).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
      }
      resumeText = text;
      document.getElementById('output').innerText = 'Resume text extracted.';
    };
    reader.readAsArrayBuffer(file);
  } else if (fileType === 'docx') {
    // DOCX extraction using mammoth.js
    const reader = new FileReader();
    reader.onload = async function() {
      const arrayBuffer = reader.result;
      const result = await mammoth.extractRawText({arrayBuffer});
      resumeText = result.value;
      document.getElementById('output').innerText = 'Resume text extracted.';
    };
    reader.readAsArrayBuffer(file);
  } else if (fileType === 'txt') {
    // Plain text
    const reader = new FileReader();
    reader.onload = function() {
      resumeText = reader.result;
      document.getElementById('output').innerText = 'Resume text extracted.';
    };
    reader.readAsText(file);
  } else {
    document.getElementById('output').innerText = 'Unsupported file type.';
    resumeText = '';
  }
});

// On popup load, trigger extraction in the content script
function tryExtractJobInfo() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//.test(tabs[0].url)) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'extractJobInfo'}, function(response) {
        if (chrome.runtime.lastError) {
          document.getElementById('output').innerText = 'Could not read job info from this page.\nMake sure you are on a job description page and try again.';
          document.getElementById('retry').style.display = '';
          return;
        }
        setTimeout(() => {
          chrome.storage.local.get(['pageText', 'jobText', 'jobTitle', 'companyName', 'companyFromUrl'], function(result) {
            // Consider pageText as a valid signal that job info was extracted
            if (!result.pageText && !result.jobText && !result.jobTitle && !result.companyName) {
              document.getElementById('output').innerText = 'No job info found. Try refreshing the job page, scrolling, or clicking Retry.';
              document.getElementById('retry').style.display = '';
            } else if (!result.jobText && (result.jobTitle || result.companyName)) {
              document.getElementById('output').innerText = 'Job description not found, but job title and/or company name detected.\n\nFor best results, generate when on the job description page.';
              document.getElementById('retry').style.display = 'none';
            } else {
              document.getElementById('retry').style.display = 'none';
            }
          });
        }, 350);
      });
    } else {
      document.getElementById('output').innerText = 'no job detected';
      document.getElementById('retry').style.display = '';
    }
  });
}

window.addEventListener('DOMContentLoaded', function() {
  document.getElementById('retry').onclick = function() {
    document.getElementById('output').innerText = 'Retrying extraction...';
    tryExtractJobInfo();
  };
  tryExtractJobInfo();
});

// Add jsPDF support for PDF download
// Enable Download PDF button after generation
let lastCoverLetterHtml = '';

// Update generate button logic
document.getElementById('generate').onclick = async function() {
  if (!resumeText) {
    document.getElementById('output').innerText = "Please upload a resume file first.";
    return;
  }
  document.getElementById('output').innerText = "Generating cover letter...";
  document.getElementById('downloadPdf').disabled = true;
  document.getElementById('downloadWord').disabled = true;
  chrome.storage.local.get(['pageText', 'companyFromUrl'], async function(result) {
    const pageText = result.pageText || "";
    const companyFromUrl = result.companyFromUrl || "";
    // Format today's date as Month Day, Year
    const today = new Date();
    const dateString = today.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    // Get tone selection
    const tone = document.getElementById('toneSelect')?.value || 'formal';
    let promptTone = '';
    if (tone === 'less-formal') {
      promptTone = 'Write a professional but friendly and not overly formal cover letter. Do NOT use or mention a hiring manager or any generic greeting. Do not use "Dear Hiring Manager" or similar. Start the letter directly with the body. Do NOT include a "Re:" or subject line. Ensure the opening sentence is natural and grammatically correct, and uses the exact job title and company name. Always put the job title in double quotes in the opening sentence. Make the letter relevant for any type of job, not just technical or developer roles.';
    } else {
      promptTone = 'Write a professional, formal cover letter. Do NOT use or mention a hiring manager or any generic greeting. Do not use "Dear Hiring Manager" or similar. Start the letter directly with the body. Do NOT include a "Re:" or subject line. Ensure the opening sentence is natural and grammatically correct, and uses the exact job title and company name. Always put the job title in double quotes in the opening sentence. Make the letter relevant for any type of job, not just technical or developer roles.';
    }
    const prompt = `${promptTone}\n\nResume Text:\n${resumeText}\n\nFull Page Text (from job site):\n${pageText}\n\nCompany Name (from URL, if available):\n${companyFromUrl}\n\nToday's Date: ${dateString}\n\nGenerate a complete, professional cover letter for the job above. Use all available information from the resume and job description. The header should include the applicant's name, address, city/state/zip, email, phone, and today's date, each on its own line. Clearly state the company name and job title, each on their own line, and ensure there is always a blank line between the header and the body. Make the letter flow naturally and avoid any awkward formatting or merged lines. Do not use a template or placeholders. Output the letter as ready-to-send text. The entire cover letter must not exceed 1,530 characters (including spaces and punctuation). If necessary, trim or summarize to fit this limit.`;
    try {
      const response = await fetch('https://cover-letter-creator.onrender.com/generate-cover-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          model: 'gpt-3.5-turbo'
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMsg = errorData.error?.message || response.statusText || "Unknown error";
        document.getElementById('output').innerText = `Error: ${errorMsg}`;
        return;
      }
      const data = await response.json();
      let formatted = (data.choices?.[0]?.message?.content || "No cover letter generated.")
        .replace(/\n/g, "<br>")
        .replace(/ +/g, " ")
        .trim();
      // Enforce 1,530 character limit (including spaces and punctuation)
      if (formatted.replace(/<br>/g, '').length > 1530) {
        // Truncate at the last full word before 1530 chars
        let plain = formatted.replace(/<br>/g, '\n');
        let cut = plain.slice(0, 1530);
        // Avoid cutting in the middle of a word
        cut = cut.slice(0, cut.lastIndexOf(' '));
        formatted = cut.replace(/\n/g, '<br>');
        // Do NOT append any note about trimming
      }
      // Remove [Company Address] and [City, State, Zip Code] fields if not filled (i.e., still in brackets)
      // Remove block lines
      formatted = formatted.replace(/<br>\[Company Address\]<br>/g, '')
                         .replace(/<br>\[City, State, Zip Code\]<br>/g, '');
      // Remove inline brackets
      formatted = formatted.replace(/\[.*?\]/g, '');
      // Remove 'Dear ...,' line if no hiring manager name (handles 'Dear ,' and 'Dear' alone)
      formatted = formatted.replace(/<br>Dear\s*,<br>/gi, '')
                           .replace(/<br>Dear\s*<br>/gi, '')
                           .replace(/<br>Dear\s*\n/gi, '')
                           .replace(/Dear\s*,?\s*<br>/gi, '');
      // Remove zip code if it's 00000
      formatted = formatted.replace(/(\d{5})(?!\d)/g, function(zip) {
        return zip === '00000' ? '' : zip;
      });
      document.getElementById('output').innerHTML = formatted;
      lastCoverLetterHtml = formatted;
      document.getElementById('downloadPdf').disabled = false;
      document.getElementById('downloadWord').disabled = false;
    } catch (err) {
      document.getElementById('output').innerText = `Error: ${err.message}`;
      document.getElementById('downloadPdf').disabled = true;
      document.getElementById('downloadWord').disabled = true;
    }
  });
};

// --- Utility: Extract header info for filename ---
// Accepts optional fallbackCompany and fallbackPosition (e.g., from companyFromUrl/jobTitle)
function extractHeaderInfoFromCoverLetter(html, fallbackCompany = '', fallbackPosition = '') {
  const lines = html.replace(/<br\s*\/?>(\s*)?/gi, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  let name = lines[0] || '';
  let recipientIdx = 6;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (/\b\w+ \d{1,2}, \d{4}\b/.test(lines[i])) {
      recipientIdx = i + 1;
      break;
    }
  }
  let company = '';
  let position = '';
  // Company: must not be 'Dear' or empty (removed Hiring Manager logic)
  for (let i = recipientIdx; i < recipientIdx + 4 && i < lines.length; i++) {
    if (lines[i] &&
        !/\b(Mr\.|Ms\.|Mrs\.|Dr\.|Dear|Street|Avenue|Road|Blvd|Drive|Lane|Court|Circle|Ave|St|Rd|Dr|\d{5}|,|@|\d)/i.test(lines[i]) &&
        !/^I am /i.test(lines[i])) {
      company = lines[i];
      break;
    }
  }
  // Position: look for quoted job title or 'for the ... position', but never a line starting with 'I am'
  for (let i = recipientIdx + 4; i < lines.length; i++) {
    if (/^I am /i.test(lines[i])) continue;
    const m = lines[i].match(/"([^"]+)"/);
    if (m && m[1]) {
      position = m[1];
      break;
    }
    const m2 = lines[i].match(/apply for the ([^"]+) position/i) || lines[i].match(/for the ([^"]+) position/i);
    if (m2 && m2[1]) {
      position = m2[1].trim();
      break;
    }
    const m3 = lines[i].match(/role of ([^.,]+)/i) || lines[i].match(/position of ([^.,]+)/i);
    if (m3 && m3[1]) {
      position = m3[1].trim();
      break;
    }
  }
  let applicant = lines[lines.length - 1] || '';
  // Clean up
  const isInvalid = v => !v || /dear|^i am /i.test(v);
  company = company.replace(/[^\w\s\-&]/g, '').trim();
  position = position.replace(/[^\w\s\-&]/g, '').trim();
  applicant = applicant.replace(/[^\w\s\-&]/g, '').trim();
  // Fallback to fallbackCompany if company is missing/invalid
  if (isInvalid(company) && fallbackCompany) {
    company = fallbackCompany.replace(/[^\w\s\-&]/g, '').trim();
  }
  // Fallback to fallbackPosition if position is missing/invalid
  if (isInvalid(position) && fallbackPosition) {
    position = fallbackPosition.replace(/[^\w\s\-&]/g, '').trim();
  }
  let filenameParts = [];
  if (!isInvalid(company)) filenameParts.push(company);
  if (!isInvalid(position)) filenameParts.push(position);
  if (applicant) filenameParts.push(applicant);
  if (filenameParts.length === 0) filenameParts = ['Cover Letter'];
  return { company, position, applicant, filenameParts };
}

// Download PDF button logic
// Requires jsPDF (add <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script> to popup.html)
document.getElementById('downloadPdf').onclick = function() {
  if (!lastCoverLetterHtml) return;
  // Use companyFromUrl, jobTitle, and companyName as fallbacks for filename extraction
  chrome.storage.local.get(['companyFromUrl', 'jobTitle', 'companyName'], function(result) {
    const fallbackCompany = result.companyFromUrl || result.companyName || '';
    const fallbackPosition = result.jobTitle || '';
    const { filenameParts } = extractHeaderInfoFromCoverLetter(lastCoverLetterHtml, fallbackCompany, fallbackPosition);
    const filename = filenameParts.join(' ') + '.pdf';
    // Convert HTML to plain text for PDF
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = lastCoverLetterHtml.replace(/<br>/g, '\n');
    const text = tempDiv.innerText;
    const { jsPDF } = window.jspdf;
    // Set up PDF with professional styling
    const doc = new jsPDF({
      unit: 'mm',
      format: 'a4'
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 25; // 1 inch margin
    let y = margin;
    let lineHeight = 8;
    let sectionSpacing = 5;
    let fontSizeNormal = 12;
    let fontSizeLarge = 16;
    const font = 'Times';
    const usableHeight = pageHeight - margin;

    // Split text into lines for section formatting
    const lines = text.split('\n');
    let nameLineIdx = lines.findIndex(l => l.trim().length > 0);
    let name = nameLineIdx !== -1 ? lines[nameLineIdx] : '';

    // --- Fit-to-one-page logic ---
    // Estimate total lines needed (including wrapped lines)
    function estimateTotalLines(fontSize, lHeight, sSpacing) {
      let total = 0;
      let i = nameLineIdx + 1;
      let addressLines = 0, recipientLines = 0;
      // Name
      if (name) total++;
      // Address
      while (i < lines.length && lines[i].trim().length > 0 && addressLines < 4) {
        total++;
        i++; addressLines++;
      }
      total++; // section spacing
      // Date
      while (i < lines.length && lines[i].trim().length === 0) i++;
      if (i < lines.length) { total++; i++; }
      total++; // section spacing
      // Recipient
      recipientLines = 0;
      while (i < lines.length && lines[i].trim().length > 0 && recipientLines < 4) {
        total++;
        i++; recipientLines++;
      }
      total++; // section spacing
      // Greeting
      while (i < lines.length && lines[i].trim().length === 0) i++;
      if (i < lines.length) { total++; i++; }
      total++;
      // Body
      while (i < lines.length) {
        if (lines[i].trim().length === 0) total++;
        else total += Math.ceil(lines[i].length / 80);
        i++;
      }
      return total;
    }

    // Print header, address, recipient, greeting, body (with company/city-state fix)
    doc.setFont(font, 'normal');
    doc.setFontSize(fontSizeNormal);
    let i = nameLineIdx;
    // Print header block
    for (let block = 0; block < 6 && i < lines.length; block++, i++) {
      if (lines[i].trim().length > 0) {
        doc.text(lines[i], margin, y, { align: 'left' });
        y += lineHeight;
      }
    }
    y += sectionSpacing;
    // Print recipient block (next 3-4 lines, with company/city-state fix)
    let recipientLines = 0;
    while (i < lines.length && lines[i].trim().length > 0 && recipientLines < 4) {
      let line = lines[i];
      // Fix: If line looks like 'CompanyCity, State', split with space
      const m = line.match(/^([A-Za-z0-9&\-. ]+)([A-Z][a-z]+, [A-Z]{2,})$/);
      if (m) {
        line = m[1].trim() + ' ' + m[2].trim();
      }
      doc.text(line, margin, y, { align: 'left' });
      y += lineHeight;
      i++;
      recipientLines++;
    }
    y += sectionSpacing;
    // Print greeting (next non-empty line)
    while (i < lines.length && lines[i].trim().length === 0) i++;
    if (i < lines.length) {
      const greetingLines = doc.splitTextToSize(lines[i], pageWidth - 2 * margin);
      greetingLines.forEach(line => {
        doc.text(line, margin, y, { align: 'left' });
        y += lineHeight;
      });
      y += sectionSpacing;
      i++;
    }
    // Print body paragraphs
    let bodyLines = [];
    while (i < lines.length) {
      if (lines[i].trim().length === 0) {
        if (bodyLines.length > 0) {
          const bodyText = bodyLines.join(' ');
          const splitBody = doc.splitTextToSize(bodyText, pageWidth - 2 * margin);
          splitBody.forEach(line => {
            doc.text(line, margin, y, { align: 'left' });
            y += lineHeight;
          });
          y += sectionSpacing;
          bodyLines = [];
        }
      } else {
        bodyLines.push(lines[i]);
      }
      i++;
    }
    if (bodyLines.length > 0) {
      const bodyText = bodyLines.join(' ');
      const splitBody = doc.splitTextToSize(bodyText, pageWidth - 2 * margin);
      splitBody.forEach(line => {
        doc.text(line, margin, y, { align: 'left' });
        y += lineHeight;
      });
    }
    doc.save(filename);
  });
};

// Download Word button logic
// Creates a simple .docx file using a Blob and triggers download
const downloadWordBtn = document.getElementById('downloadWord');
downloadWordBtn.onclick = function() {
  if (!lastCoverLetterHtml) return;
  // Use companyFromUrl, jobTitle, and companyName as fallbacks for filename extraction
  chrome.storage.local.get(['companyFromUrl', 'jobTitle', 'companyName'], function(result) {
    const fallbackCompany = result.companyFromUrl || result.companyName || '';
    const fallbackPosition = result.jobTitle || '';
    const { filenameParts } = extractHeaderInfoFromCoverLetter(lastCoverLetterHtml, fallbackCompany, fallbackPosition);
    const filename = filenameParts.join(' ') + '.doc';
    // Convert HTML to Word-compatible HTML
    const htmlContent = `<!DOCTYPE html><html><head><meta charset='utf-8'></head><body style="font-family:Times New Roman,serif;font-size:12pt;">${lastCoverLetterHtml.replace(/<br>/g, '<br>')}</body></html>`;
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  });
};

// Enable Download Word button after generation
// (also disable at start)
downloadWordBtn.disabled = true;
const origGenerateOnClick = document.getElementById('generate').onclick;
document.getElementById('generate').onclick = async function() {
  await origGenerateOnClick?.();
  if (lastCoverLetterHtml) {
    downloadWordBtn.disabled = false;
  }
};
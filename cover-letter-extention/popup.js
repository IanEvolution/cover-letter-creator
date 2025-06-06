// Resume upload and parsing logic
let resumeText = '';
const resumeUpload = document.getElementById('resumeUpload');
const resumeFileNameIndicator = document.createElement('div');
resumeFileNameIndicator.id = 'resumeFileNameIndicator';
resumeFileNameIndicator.style = 'margin-top: 6px; font-size: 0.95rem; color: #2356c7; font-weight: 500; word-break: break-all;';
resumeUpload.parentNode.insertBefore(resumeFileNameIndicator, resumeUpload.nextSibling);

resumeUpload.addEventListener('change', async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  resumeFileNameIndicator.innerText = `Selected: ${file.name}`;
  // Save file name to storage for persistence
  chrome.storage.local.set({ resumeFileName: file.name });
  const fileType = file.name.split('.').pop().toLowerCase();
  document.getElementById('output').innerText = 'Extracting resume text...';
  try {
    if (fileType === 'pdf') {
      if (typeof pdfjsLib === 'undefined') {
        document.getElementById('output').innerText = 'PDF extraction library (pdf.js) not loaded.';
        resumeText = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async function() {
        try {
          const typedarray = new Uint8Array(reader.result);
          const loadingTask = pdfjsLib.getDocument({data: typedarray});
          const pdf = await loadingTask.promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
          }
          resumeText = text;
          chrome.storage.local.set({ resumeText, resumeFileName: file.name });
          document.getElementById('output').innerText = 'Resume text extracted.';
        } catch (err) {
          document.getElementById('output').innerText = 'Failed to extract PDF text: ' + err.message;
          resumeText = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (fileType === 'docx') {
      if (typeof mammoth === 'undefined') {
        document.getElementById('output').innerText = 'DOCX extraction library (mammoth.js) not loaded.';
        resumeText = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async function() {
        try {
          const arrayBuffer = reader.result;
          const result = await mammoth.extractRawText({arrayBuffer});
          resumeText = result.value;
          chrome.storage.local.set({ resumeText, resumeFileName: file.name });
          document.getElementById('output').innerText = 'Resume text extracted.';
        } catch (err) {
          document.getElementById('output').innerText = 'Failed to extract DOCX text: ' + err.message;
          resumeText = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (fileType === 'txt') {
      const reader = new FileReader();
      reader.onload = function() {
        resumeText = reader.result;
        chrome.storage.local.set({ resumeText, resumeFileName: file.name }); // Save both resume and file name persistently
        document.getElementById('output').innerText = 'Resume text extracted.';
      };
      reader.readAsText(file);
    } else {
      document.getElementById('output').innerText = 'Unsupported file type.';
      resumeText = '';
    }
  } catch (err) {
    document.getElementById('output').innerText = 'Resume extraction error: ' + err.message;
    resumeText = '';
  }
});

// On popup load, restore resume if present
window.addEventListener('DOMContentLoaded', function() {
  chrome.storage.local.get(['resumeText', 'resumeFileName'], function(result) {
    if (result.resumeText && result.resumeText.trim().length > 0) {
      resumeText = result.resumeText;
      document.getElementById('output').innerText = 'Resume loaded from previous session.';
      if (result.resumeFileName) {
        resumeFileNameIndicator.innerText = `Loaded: ${result.resumeFileName}`;
      } else {
        resumeFileNameIndicator.innerText = 'Loaded: (resume from previous session)';
      }
    } else {
      resumeFileNameIndicator.innerText = '';
    }
  });

  // On load, check for iframes first
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//.test(tabs[0].url)) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'checkForIframes'}, function(response) {
        if (chrome.runtime.lastError) {
          document.getElementById('output').innerText = 'Could not read job info from this page. Make sure you are on a job description page and try again.';
          document.getElementById('retry').style.display = '';
          return;
        }
        if (response && response.hasIframe) {
          showManualInputBox();
        } else {
          tryExtractJobInfo();
        }
      });
    } else {
      document.getElementById('output').innerText = 'no job detected';
      document.getElementById('retry').style.display = '';
    }
  });

  document.getElementById('retry').onclick = function() {
    document.getElementById('output').innerText = 'Retrying extraction...';
    // On retry, re-check for iframes
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//.test(tabs[0].url)) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'checkForIframes'}, function(response) {
          if (chrome.runtime.lastError) {
            document.getElementById('output').innerText = 'Could not read job info from this page. Make sure you are on a job description page and try again.';
            document.getElementById('retry').style.display = '';
            return;
          }
          if (response && response.hasIframe) {
            showManualInputBox();
          } else {
            tryExtractJobInfo();
          }
        });
      } else {
        document.getElementById('output').innerText = 'no job detected';
        document.getElementById('retry').style.display = '';
      }
    });
  };

  // DEBUG: Show extracted pageText in a modal or alert for inspection
  document.addEventListener('keydown', function(e) {
    // Press Ctrl+Shift+Y to show the extracted text
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'y') {
      chrome.storage.local.get(['pageText'], function(result) {
        if (result.pageText) {
          // Show in a modal window for easier inspection
          const modal = document.createElement('div');
          modal.style.position = 'fixed';
          modal.style.top = '0';
          modal.style.left = '0';
          modal.style.width = '100vw';
          modal.style.height = '100vh';
          modal.style.background = 'rgba(0,0,0,0.7)';
          modal.style.zIndex = '9999';
          modal.style.display = 'flex';
          modal.style.alignItems = 'center';
          modal.style.justifyContent = 'center';

          const inner = document.createElement('div');
          inner.style.background = '#fff';
          inner.style.padding = '24px';
          inner.style.borderRadius = '8px';
          inner.style.maxWidth = '90vw';
          inner.style.maxHeight = '80vh';
          inner.style.overflow = 'auto';
          inner.style.fontSize = '1rem';
          inner.style.whiteSpace = 'pre-wrap';
          inner.innerText = result.pageText;

          const closeBtn = document.createElement('button');
          closeBtn.innerText = 'Close';
          closeBtn.style.marginTop = '12px';
          closeBtn.onclick = () => document.body.removeChild(modal);
          inner.appendChild(document.createElement('br'));
          inner.appendChild(closeBtn);

          modal.appendChild(inner);
          document.body.appendChild(modal);
        } else {
          alert('No page text extracted yet.');
        }
      });
    }
  });
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
  chrome.storage.local.get(['pageText', 'companyFromUrl', 'manualJobText'], async function(result) {
    // Use manualJobText if present, otherwise use pageText
    let pageText = result.manualJobText && result.manualJobText.trim().length > 0 ? result.manualJobText : (result.pageText || "");
    const companyFromUrl = result.companyFromUrl || "";
    // Format today's date as Month Day, Year
    const today = new Date();
    const dateString = today.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    // Get tone selection
    const tone = document.getElementById('toneSelect')?.value || 'formal';
    let promptTone = '';
    if (tone === 'less-formal') {
      promptTone = 'Write a professional but friendly and not overly formal cover letter. Do NOT use or mention a hiring manager or any generic greeting. Do not use "Dear Hiring Manager" or similar. Start the letter directly with the body. Do NOT include a "Re:" or subject line. Ensure the opening sentence is natural and grammatically correct, and uses the exact job title and company name. Always put the job title in double quotes in the opening sentence. Make the letter relevant for any type of job, not just technical or developer roles. and please make it 1530 characters long but no longer than that.';
    } else {
      promptTone = 'Write a professional, formal cover letter. Do NOT use or mention a hiring manager or any generic greeting. Do not use "Dear Hiring Manager" or similar. Start the letter directly with the body. Do NOT include a "Re:" or subject line. Ensure the opening sentence is natural and grammatically correct, and uses the exact job title and company name. Always put the job title in double quotes in the opening sentence. Make the letter relevant for any type of job, not just technical or developer roles. and please make it 1530 characters long but no longer than that.';
    }
    const prompt = `${promptTone}\n\nResume Text:\n${resumeText}\n\nFull Page Text (copied from the job site, may include all visible text):\n${pageText}\n\nCompany Name (from URL, if available):\n${companyFromUrl}\n\nToday's Date: ${dateString}\n\nFrom the full page text above, extract the job title, company name, and especially the job requirements or qualifications. In your cover letter, specifically acknowledge and address the key requirements or qualifications listed in the job description. Use your best judgment if the information is ambiguous or not clearly labeled. Then generate a complete, professional cover letter for the job above. Use all available information from the resume and job description. The header should include the applicant's name, address, city/state/zip, email, phone, and today's date, each on its own line. Clearly state the company name and job title, each on their own line, and ensure there is always a blank line between the header and the body. Make the letter flow naturally and avoid any awkward formatting or merged lines. Do not use a template or placeholders. Output the letter as ready-to-send text. and please make it 1530 characters long but no longer than that.`;
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
        // Collapse 3+ line breaks to just 2 (so never more than one blank line)
        .replace(/\n/g, "<br>")
        .replace(/ +/g, " ")
        .trim();
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
      // Clear manualJobText after use to prevent reuse on new sites
      chrome.storage.local.remove('manualJobText');
    } catch (err) {
      document.getElementById('output').innerText = `Error: ${err.message}`;
      document.getElementById('downloadPdf').disabled = true;
      document.getElementById('downloadWord').disabled = true;
    }
  });
};

// --- Utility: Extract header info for filename ---
// Accepts optional fallbackCompany (e.g., from companyFromUrl/companyName)
function extractHeaderInfoFromCoverLetter(html, fallbackCompany = '') {
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
  // Company: must not be 'Dear' or empty (removed Hiring Manager logic)
  for (let i = recipientIdx; i < recipientIdx + 4 && i < lines.length; i++) {
    if (lines[i] &&
        !/\b(Mr\.|Ms\.|Mrs\.|Dr\.|Dear|Street|Avenue|Road|Blvd|Drive|Lane|Court|Circle|Ave|St|Rd|Dr|\d{5}|,|@|\d)/i.test(lines[i]) &&
        !/^I am /i.test(lines[i])) {
      company = lines[i];
      break;
    }
  }
  let applicant = lines[0] || '';
  // Clean up
  const isInvalid = v => !v || /dear|^i am /i.test(v);
  company = company.replace(/[^\w\s\-&]/g, '').trim();
  applicant = applicant.replace(/[^\w\s\-&]/g, '').trim();
  // Fallback to fallbackCompany if company is missing/invalid
  if (isInvalid(company) && fallbackCompany) {
    company = fallbackCompany.replace(/[^\w\s\-&]/g, '').trim();
  }
  if (isInvalid(applicant)) applicant = '';
  return { company, applicant };
}

// Utility: Sanitize and generate a filename for downloads
function getDownloadFilename(company, applicant, ext) {
  let safeCompany = (company || '').replace(/[^\w\s\-]/g, '').trim();
  let safeApplicant = (applicant || '').replace(/[^\w\s\-]/g, '').trim();
  if (!safeCompany) safeCompany = 'Company';
  if (!safeApplicant) safeApplicant = 'Applicant';
  return `${safeCompany} - ${safeApplicant}.${ext}`;
}

// Download PDF button logic
// Requires jsPDF (add <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script> to popup.html)
document.getElementById('downloadPdf').onclick = function() {
  if (!lastCoverLetterHtml) return;
  chrome.storage.local.get(['companyFromUrl', 'companyName'], function(result) {
    const fallbackCompany = result.companyFromUrl || result.companyName || '';
    const { company, applicant } = extractHeaderInfoFromCoverLetter(lastCoverLetterHtml, fallbackCompany);
    const filename = getDownloadFilename(company, applicant, 'pdf');
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
    let font = 'Times';
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
const downloadWordBtn = document.getElementById('downloadWord');
downloadWordBtn.onclick = function() {
  if (!lastCoverLetterHtml) return;
  chrome.storage.local.get(['companyFromUrl', 'companyName'], function(result) {
    const fallbackCompany = result.companyFromUrl || result.companyName || '';
    const { company, applicant } = extractHeaderInfoFromCoverLetter(lastCoverLetterHtml, fallbackCompany);
    const filename = getDownloadFilename(company, applicant, 'doc');
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

function showManualInputBox() {
  const output = document.getElementById('output');
  output.innerHTML = `<div style="color:#b00;font-weight:600;margin-bottom:8px;">This job description is loaded in a secure iframe and cannot be extracted automatically.<br>Please copy and paste the job description below:</div>
    <textarea id="manualJobText" style="width:100%;height:120px;resize:vertical;font-size:1rem;padding:8px;border-radius:6px;border:1px solid #ccc;"></textarea>
    <button id="submitManualJobText" style="margin-top:10px;display:block;width:100%;background:#2356c7;color:#fff;font-size:1rem;padding:8px 0;border-radius:6px;border:none;cursor:pointer;">Submit Job Description</button>`;
  document.getElementById('retry').style.display = 'none';
  document.getElementById('submitManualJobText').onclick = function() {
    // Save manual input to storage for later use
    const manualJobText = document.getElementById('manualJobText').value;
    chrome.storage.local.set({ manualJobText });
    output.innerHTML = '<span style="color:green;font-weight:600;">Job description submitted! Now upload your resume and click Generate.</span>';
  };
}
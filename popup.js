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
          chrome.storage.local.get(['jobText', 'jobTitle', 'companyName', 'pageText'], function(result) {
            if (!result.jobText && !result.jobTitle && !result.companyName) {
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
      document.getElementById('output').innerText = 'This extension only works on regular job pages (not Chrome or extension pages).';
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
    let template = `
[Your Name]
[Your Address]
[City, State ZIP Code]
[Your Email Address]
[Your Phone Number]
[Date]

[Hiring Manager's Name]
[Company Name]
[Company Address]
[City, State, Zip Code]

Dear [Hiring Manager's Name],

I am writing to express my interest in the [specific job position] at [Company Name], as advertised. With a strong background in [relevant field or industry], I am excited about the opportunity to contribute my skills and experience to your team.

Throughout my career, I have developed a solid foundation in [key skills or qualifications mentioned in the job description]. My previous roles have equipped me with the ability to [specific tasks or responsibilities mentioned in the job description]. I am confident that my expertise in [specific skill or area of expertise] would make me a valuable asset to [Company Name].

I am particularly drawn to [Company Name]'s commitment to [mention any specific values, missions, or goals of the company as stated on their website or job postings]. I am impressed by the innovative work being done at your organization and am eager to be a part of a team that is dedicated to [mention any specific projects or initiatives highlighted on the company's website].

I am excited about the prospect of bringing my unique skills and experiences to [Company Name] and am confident in my ability to make a positive contribution. I am looking forward to the opportunity to discuss how my background, skills, and enthusiasms align with the needs of your team.

Thank you for considering my application. I look forward to the possibility of discussing this exciting opportunity with you.

Warm regards,

[Your Name]
`;
    // Pre-fill [Company Name] in the header if we have a good guess
    if (companyFromUrl) {
      template = template.replace(/\[Company Name\]/g, companyFromUrl);
    }
    // Pre-fill [Date] with today's date
    template = template.replace(/\[Date\]/g, dateString);
    let promptTone = '';
    if (tone === 'less-formal') {
      promptTone = 'Write a professional but friendly and not overly formal cover letter. Use simpler language and a conversational tone. Ensure the opening sentence is natural and grammatically correct, especially if the job title includes technologies or tools. If the job title contains technologies or tools (e.g., Automation Tester with Python & Playwright), rephrase the opening so it sounds natural, such as: "I am excited to apply for the \"Automation Tester with Python & Playwright\" position at Cognizant Technology Solutions, where my experience with Python and Playwright will be an asset." Always put the job title in double quotes in the opening sentence. Do not use awkward phrasing like "the Automation Tester with Python & Playwright position."';
    } else {
      promptTone = 'Write a professional, formal cover letter. Ensure the opening sentence is natural and grammatically correct, especially if the job title includes technologies or tools. If the job title contains technologies or tools (e.g., Automation Tester with Python & Playwright), rephrase the opening so it sounds natural, such as: "I am excited to apply for the \"Automation Tester with Python & Playwright\" position at Cognizant Technology Solutions, where my experience with Python and Playwright will be an asset." Always put the job title in double quotes in the opening sentence. Do not use awkward phrasing like "the Automation Tester with Python & Playwright position."';
    }
    const prompt = `${promptTone}\n\nResume Text:\n${resumeText}\n\nFull Page Text (from job site):\n${pageText}\n\nCompany Name (from URL, if available):\n${companyFromUrl}\n\nExtract the job title, company name, and job description from the full page text above. If the company name is missing, use the company name from the URL if available. Use all available information to fill in the following cover letter template with the applicant's personal information (name, address, city/state/zip, email, phone) from the resume, and tailor the letter to the job and company. Replace all placeholders.\n\nTemplate:\n${template}`;
    try {
      const response = await fetch('https://cover-letter-generator-cr21.onrender.com/generate-cover-letter', {
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
      // Remove [Hiring Manager's Name], [Company Address], and [City, State, Zip Code] fields if not filled (i.e., still in brackets)
      // If [Hiring Manager's Name] is missing, also remove the 'Dear ...,' line
      // Remove block lines
      formatted = formatted.replace(/<br>\[Hiring Manager's Name\]<br>/g, '')
                         .replace(/<br>\[Company Address\]<br>/g, '')
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

// Download PDF button logic
// Requires jsPDF (add <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script> to popup.html)
document.getElementById('downloadPdf').onclick = function() {
  if (!lastCoverLetterHtml) return;
  // Try to get company and person name for filename
  let company = '';
  let person = '';
  const html = lastCoverLetterHtml;
  // Company name: try to find in greeting or body
  const companyMatch = html.match(/at ([^,<\n]+)/i) || html.match(/\n([^\n]+)\nDear/) || html.match(/Dear [^,]+,?\n?\s*at ([^,<\n]+)/i);
  if (companyMatch && companyMatch[1]) {
    company = companyMatch[1].replace(/[^\w\s\-&]/g, '').trim();
  }
  // Person name: look for last non-empty line (signature)
  const pdfLinesForName = html.replace(/<br\s*\/?>(\s*)?/gi, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (pdfLinesForName.length > 0) {
    person = pdfLinesForName[pdfLinesForName.length - 1].replace(/[^\w\s\-&]/g, '').trim();
  }
  if (!company) company = 'Company';
  if (!person) person = 'Applicant';
  const filename = `${company} cover letter - ${person}.pdf`;
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
      total++; i++; recipientLines++;
    }
    total++; // section spacing
    // Greeting
    while (i < lines.length && lines[i].trim().length === 0) i++;
    if (i < lines.length) { total++; i++; }
    total++; // section spacing
    // Body (estimate wrapped lines)
    let bodyLines = [];
    while (i < lines.length) {
      if (lines[i].trim().length === 0) {
        if (bodyLines.length > 0) {
          const bodyText = bodyLines.join(' ');
          const splitBody = doc.splitTextToSize(bodyText, pageWidth - 2 * margin);
          total += splitBody.length;
          total++; // section spacing
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
      total += splitBody.length;
    }
    return total;
  }

  // Try to fit by reducing font size/line height if needed
  let fits = false;
  let minFontSize = 8;
  let minLineHeight = 5;
  for (let tryFont = fontSizeNormal; tryFont >= minFontSize; tryFont--) {
    for (let tryLine = lineHeight; tryLine >= minLineHeight; tryLine--) {
      let estLines = estimateTotalLines(tryFont, tryLine, sectionSpacing);
      if (margin + estLines * tryLine < pageHeight - margin) {
        fontSizeNormal = tryFont;
        fontSizeLarge = Math.max(tryFont + 3, fontSizeLarge);
        lineHeight = tryLine;
        fits = true;
        break;
      }
    }
    if (fits) break;
  }
  if (!fits) {
    // If it still doesn't fit, shrink everything to min and let it overflow
    fontSizeNormal = minFontSize;
    fontSizeLarge = minFontSize + 3;
    lineHeight = minLineHeight;
  }

  // Print name in large font
  y = margin;
  if (name) {
    doc.setFont(font, 'bold');
    doc.setFontSize(fontSizeLarge);
    doc.text(name, margin, y, { align: 'left' });
    y += lineHeight + 2;
  }

  // Print address block (next 3-4 lines)
  doc.setFont(font, 'normal');
  doc.setFontSize(fontSizeNormal);
  let i = nameLineIdx + 1;
  let addressLines = 0;
  while (i < lines.length && lines[i].trim().length > 0 && addressLines < 4) {
    doc.text(lines[i], margin, y, { align: 'left' });
    y += lineHeight;
    i++;
    addressLines++;
  }
  y += sectionSpacing;

  // Print date (next non-empty line)
  while (i < lines.length && lines[i].trim().length === 0) i++;
  if (i < lines.length) {
    doc.text(lines[i], margin, y, { align: 'left' });
    y += lineHeight + sectionSpacing;
    i++;
  }

  // Print recipient block (next 3-4 lines)
  let recipientLines = 0;
  while (i < lines.length && lines[i].trim().length > 0 && recipientLines < 4) {
    doc.text(lines[i], margin, y, { align: 'left' });
    y += lineHeight;
    i++;
    recipientLines++;
  }
  y += sectionSpacing;

  // Print greeting (next non-empty line)
  while (i < lines.length && lines[i].trim().length === 0) i++;
  if (i < lines.length) {
    // Wrap and print the greeting line (e.g., Dear ...)
    const greetingLines = doc.splitTextToSize(lines[i], pageWidth - 2 * margin);
    greetingLines.forEach(line => {
      doc.text(line, margin, y, { align: 'left' });
      y += lineHeight;
    });
    y += sectionSpacing;
    i++;
  }

  // Print body paragraphs (including the first one, with wrapping)
  let bodyLines = [];
  while (i < lines.length) {
    if (lines[i].trim().length === 0) {
      if (bodyLines.length > 0) {
        // Wrap and print the paragraph
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
  // Print any remaining body lines (last paragraph)
  if (bodyLines.length > 0) {
    const bodyText = bodyLines.join(' ');
    const splitBody = doc.splitTextToSize(bodyText, pageWidth - 2 * margin);
    splitBody.forEach(line => {
      doc.text(line, margin, y, { align: 'left' });
      y += lineHeight;
    });
  }

  doc.save(filename);
};

document.getElementById('downloadWord').onclick = function() {
  if (!lastCoverLetterHtml) return;
  // Wrap the HTML in a Word-compatible structure
  const htmlContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Cover Letter</title></head>
<body>${lastCoverLetterHtml.replace(/<br>/g, '<br/>')}</body></html>`;
  const blob = new Blob([htmlContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cover-letter.docx';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// Download Word button logic
// Creates a simple .docx file using a Blob and triggers download
const downloadWordBtn = document.getElementById('downloadWord');
downloadWordBtn.onclick = function() {
  if (!lastCoverLetterHtml) return;
  // Try to get company and person name for filename
  let company = '';
  let person = '';
  // Try to extract from lastCoverLetterHtml (fallback to blanks if not found)
  // Company: look for first occurrence of 'at <b>Company Name</b>' or 'at [Company Name]' or 'at <company>'
  // Person: look for closing signature (last non-empty line)
  const html = lastCoverLetterHtml;
  // Company name: try to find in greeting or body
  const companyMatch = html.match(/at ([^,<\n]+)/i) || html.match(/\n([^\n]+)\nDear/) || html.match(/Dear [^,]+,?\n?\s*at ([^,<\n]+)/i);
  if (companyMatch && companyMatch[1]) {
    company = companyMatch[1].replace(/[^\w\s\-&]/g, '').trim();
  }
  // Person name: look for last non-empty line (signature)
  const lines = html.replace(/<br\s*\/?>(\s*)?/gi, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    person = lines[lines.length - 1].replace(/[^\w\s\-&]/g, '').trim();
  }
  // Fallbacks
  if (!company) company = 'Company';
  if (!person) person = 'Applicant';
  // Format filename
  const filename = `${company} cover letter - ${person}.doc`;
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
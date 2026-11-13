/**
 * A sample membership form for the PDF lab and tests. Page 1 is fillable with cryptic field names
 * ("Text1"…) and printed labels, so Smart Fill has to read the page; page 2 is a flat paper form.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function sampleForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle('Community Center Membership Application');
  const p = doc.addPage([612, 792]); const form = doc.getForm();
  p.drawText('Community Center Membership Application', { x: 50, y: 735, size: 18, font: bold });
  p.drawText('Please print clearly. Fields marked * are required. Deadline: December 1, 2026.', { x: 50, y: 712, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  const row = (label: string, name: string, y: number, x = 50, w = 300, labelW = 110) => {
    p.drawText(label, { x, y: y + 4, size: 10, font });
    form.createTextField(name).addToPage(p, { x: x + labelW, y, width: w, height: 16, borderWidth: 0.5 });
  };
  row('First name *', 'Text1', 670); row('Last name *', 'Text2', 645); row('Email address', 'Text3', 620); row('Phone', 'Text4', 595, 50, 160);
  row('Street address', 'Text5', 570); row('City', 'Text6', 545, 50, 140); row('ZIP', 'Text7', 545, 310, 70, 30);
  p.drawText('State', { x: 400, y: 549, size: 10, font }); const st = form.createDropdown('Dropdown1'); st.addOptions(['', 'Illinois', 'Michigan', 'Ohio']); st.addToPage(p, { x: 432, y: 545, width: 90, height: 16 });
  row('Date of birth (mm/dd/yyyy)', 'Text8', 520, 50, 120, 150);
  row('Emergency contact', 'Text9', 495); row('Emergency phone', 'Text10', 470, 50, 160);
  row('T-shirt size', 'Text11', 445, 50, 60);
  row('Social Security No.', 'Text12', 420, 50, 140);
  p.drawText('Are you a veteran?', { x: 50, y: 394, size: 10, font }); form.createCheckBox('Check Box1').addToPage(p, { x: 160, y: 392, width: 12, height: 12 });
  p.drawText('I certify that the information above is true and complete.', { x: 70, y: 364, size: 10, font }); form.createCheckBox('Check Box2').addToPage(p, { x: 50, y: 362, width: 12, height: 12 });
  row('Signature', 'Text13', 330, 50, 220); row('Date', 'Text14', 330, 400, 100, 30);
  p.drawText('See page 2 for the volunteer sign-up sheet.', { x: 50, y: 290, size: 10, font, color: rgb(0.2, 0.3, 0.6) });
  const q = doc.addPage([612, 792]);
  q.drawText('Volunteer Sign-up (paper form)', { x: 50, y: 735, size: 16, font: bold });
  q.drawText('Name ______________________________', { x: 50, y: 690, size: 11, font });
  q.drawText('Phone ____________________', { x: 50, y: 660, size: 11, font });
  q.drawText('Email ______________________________', { x: 50, y: 630, size: 11, font });
  q.drawText('Volunteers help with the food pantry on Saturdays and the after-school program.', { x: 50, y: 590, size: 10, font });
  return doc.save();
}


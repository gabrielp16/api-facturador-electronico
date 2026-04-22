import AdmZip from 'adm-zip';

export const zipXmlToBase64 = (fileName: string, xmlContent: string): string => {
  const zip = new AdmZip();
  zip.addFile(fileName, Buffer.from(xmlContent, 'utf8'));
  return zip.toBuffer().toString('base64');
};
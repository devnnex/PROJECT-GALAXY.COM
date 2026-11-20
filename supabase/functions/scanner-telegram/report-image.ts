import { reportCardTree } from './report-card.js';
export async function renderReportImage(job: {kind:string;payload:Record<string,unknown>}) {
  // Loaded only for a weekly/monthly job; no browser or paid image service.
  const { ImageResponse } = await import('npm:@vercel/og@0.8.6');
  const response = new ImageResponse(reportCardTree(job),{width:1200,height:760});
  return new Blob([await response.arrayBuffer()],{type:'image/png'});
}

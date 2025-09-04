import { Models, ServerClient } from 'postmark';
import { type Attachment, type Header } from 'postmark';

export interface IMail {
  from?: string;
  to: string;
  subject: string;
  textbody: string;
  htmlbody?: string;
  headers?: Header[];
  attachments?: Attachment[];
  cc?: string[];
  bcc?: string[];
  replyto?: string;
}

export const sendEmail = async ({
  from = `Elyx Finance <${process.env.POSTMARK_FROM}>`,
  to,
  subject,
  textbody,
  htmlbody,
  attachments,
  cc,
  bcc,
  replyto,
  headers,
}: IMail) => {
  const client = new ServerClient(process.env.POSTMARK_APIKEY ?? '');
  const email: Models.Message = {
    From: from,
    To: to,
    Subject: subject,
    TextBody: textbody,
    HtmlBody: htmlbody,
    TrackLinks: Models.LinkTrackingOptions.None,
    ...(attachments && attachments.length > 0
      ? { Attachments: attachments.map((a) => a) }
      : undefined),
    ...(cc ? { Cc: cc.join(',') } : undefined),
    ...(bcc ? { Bcc: bcc.join(',') } : undefined),
    ...(replyto ? { ReplyTo: replyto } : undefined),
    ...(headers && headers.length > 0 ? { Headers: headers } : undefined),
  };
  return await client.sendEmail(email);
};
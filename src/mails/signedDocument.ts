export const signedDocumentMail = () => {
    const subject = '[Elyx Finance] Document signé';
  
    const htmlbody = `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>Elyx Finance – Document signé</title>
  <!-- Pré-en-tête (apercu) -->
  <meta name="x-apple-disable-message-reformatting">
  <style>
    /* Reset de base */
    html, body { margin:0 !important; padding:0 !important; height:100% !important; width:100% !important; }
    * { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt !important; mso-table-rspace:0pt !important; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:0; text-decoration:none; }
    a { text-decoration:none; }
    /* Liens auto-stylés par iOS */
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
    /* Mobile */
    @media screen and (max-width:600px){
      .container { width:100% !important; }
      .p-24 { padding:20px !important; }
      .h1 { font-size:24px !important; line-height:30px !important; }
      .center { text-align:center !important; }
      .btn a { display:block !important; }
    }
  </style>
</head>
<body style="background:#f4f6f8; margin:0; padding:0;">
  <!-- Préheader caché -->
  <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;">
    Votre document signé est en pièce jointe. Contactez votre conseiller si besoin.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f8;">
    <tr>
      <td align="center">
        <!-- Conteneur -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px; max-width:600px; background:#ffffff;">
          <!-- En-tête -->
          <tr>
            <td align="center" style="background:#0b3d35; padding:28px;">
              <!-- Remplacez par un logo image si besoin -->
              <span class="h1" style="font-family:Arial,Helvetica,sans-serif; font-size:28px; line-height:34px; color:#ffffff; font-weight:700; letter-spacing:.2px;">
                Elyx finance
              </span>
            </td>
          </tr>

          <!-- Corps -->
          <tr>
            <td class="p-24" style="padding:28px; font-family:Arial,Helvetica,sans-serif; color:#0b0c0d;">
              <p style="margin:0 0 18px 0; font-size:16px; line-height:24px; font-weight:700;">Bonjour,</p>

              <p style="margin:0 0 18px 0; font-size:16px; line-height:24px;">
                Vous trouverez le document signé en pièce jointe de ce mail.
              </p>

              <p style="margin:0 0 10px 0; font-size:16px; line-height:24px;">
                Si vous avez des questions, vous pouvez vous adresser à votre conseiller ou nous joindre par téléphone au&nbsp;:
              </p>

              <p style="margin:0 0 22px 0; font-size:18px; line-height:26px; font-weight:700; text-align:center;">
                <a href="tel:+41782545447" style="color:#0b3d35;">+41.78.254.54.47</a>
              </p>

              <p style="margin:0 0 14px 0; font-size:16px; line-height:24px;">
                ou en prenant rendez-vous directement en ligne sur notre site web&nbsp;:
              </p>

              <!-- Bouton (bulletproof) -->
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="btn" style="margin:0 auto 24px auto;">
                <tr>
                  <td align="center" bgcolor="#0b3d35" style="border-radius:6px;">
                    <a href="https://elyx-finance.ch/contact"
                       target="_blank"
                       style="display:inline-block; padding:12px 22px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:20px; color:#ffffff; font-weight:700; text-decoration:none;">
                      Site web - Elyx Finance
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 0 0; font-size:16px; line-height:24px;">
                Merci pour votre confiance,<br>
                <strong>Elyx Finance.</strong>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  
    return { subject, textbody: htmlbody, htmlbody: htmlbody };
  };
  
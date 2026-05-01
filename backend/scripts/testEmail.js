require('dotenv').config();
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;

async function testSend() {
  try {
    const oauth2Client = new OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    
    const { token: accessToken } = await oauth2Client.getAccessToken();
    console.log('[1] Access token OK:', accessToken ? 'YES' : 'NO');
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        accessToken,
      },
    });
    
    console.log('[2] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[3] SMTP Verified! Sending test email...');
    
    const info = await transporter.sendMail({
      from: `"GenoVault Test" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: 'OTP Test - 123456',
      text: 'Your test OTP is: 123456',
    });
    console.log('[4] Email sent! MessageId:', info.messageId);
    console.log('[SUCCESS] OTP email system is working correctly!');
  } catch(e) {
    console.error('[FAIL]', e.message);
    if (e.response) console.error('SMTP Response:', e.response);
    if (e.code) console.error('Error code:', e.code);
  }
}

testSend();

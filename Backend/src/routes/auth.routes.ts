import { Router, Request, Response } from 'express';
import { GoogleSheetsService } from '../services/GoogleSheetsService';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const googleSheets = new GoogleSheetsService();

// Initiate Google OAuth flow
router.get('/google', (_req: Request, res: Response) => {
  const authUrl = googleSheets.getAuthUrl();
  res.redirect(authUrl);
});

// OAuth callback
router.get('/google/callback', asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Authorization code not provided'
    });
  }

  const tokens = await googleSheets.getTokensFromCode(code as string);

  return res.json({
    success: true,
    message: 'Authentication successful',
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    },
    instructions: 'Add the refresh_token to your .env file as GOOGLE_REFRESH_TOKEN'
  });
}));

export default router;

import type { Request, Response } from 'express';

const cookieSameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax';
const isProd = process.env.NODE_ENV === 'production';

export async function logout(req: Request, res: Response) {
	req.logout((err) => {
		if (err) {
			return res.status(500).json({ message: 'Logout failed' });
		}
		req.session.destroy((destroyErr) => {
			if (destroyErr) {
				return res.status(500).json({ message: 'Session destroy failed' });
			}
			res.clearCookie('connect.sid', {
				path: '/',
				httpOnly: true,
				secure: cookieSameSite === 'none' || isProd,
				sameSite: cookieSameSite
			});
			res.json({ message: 'Logged out successfully' });
		});
	});
}

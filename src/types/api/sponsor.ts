import type { SponsorStatus } from '../domain/sponsor';

export interface SponsorResponse {
	id: string;
	name: string;
	description: string | null;
	logoUrl: string | null;
	link: string | null;
	status: SponsorStatus;
}

export interface SponsorStatusSummary {
	plan: 'free' | 'premium';
	canManageSponsors: boolean;
}

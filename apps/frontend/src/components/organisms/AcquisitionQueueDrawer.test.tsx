import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AcquisitionQueueDrawer } from './AcquisitionQueueDrawer';
import * as acquisitionService from '@/services/acquisitionService';

vi.mock('@/services/themeService', () => ({
  useTheme: () => ({
    currentTheme: {
      bgCard: '#111',
      borderColor: '#222',
      primary: '#f59e0b',
    },
  }),
}));

describe('AcquisitionQueueDrawer', () => {
  it('renders floating status pill with active downloads count', async () => {
    vi.spyOn(acquisitionService, 'getAcquisitionQueue').mockResolvedValue([
      {
        id: 'job-1',
        trackTitle: 'Aerodynamic',
        artistName: 'Daft Punk',
        albumTitle: 'Discovery',
        status: 'downloading',
        percent: 45,
        speedBytesPerSec: 4_500_000,
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<AcquisitionQueueDrawer floatingPill={true} />);

    const pill = await screen.findByTitle('Open Acquisition Queue');
    expect(pill).toBeInTheDocument();
    expect(screen.getByText(/downloading 1 track/i)).toBeInTheDocument();
    expect(screen.getByText(/4.3 mb\/s/i)).toBeInTheDocument();
  });

  it('renders drawer list with active jobs, progress, and actions', async () => {
    vi.spyOn(acquisitionService, 'getAcquisitionQueue').mockResolvedValue([
      {
        id: 'job-1',
        trackTitle: 'One More Time',
        artistName: 'Daft Punk',
        albumTitle: 'Discovery',
        status: 'downloading',
        percent: 60,
        speedBytesPerSec: 3_200_000,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'job-2',
        trackTitle: 'Digital Love',
        artistName: 'Daft Punk',
        albumTitle: 'Discovery',
        status: 'completed',
        percent: 100,
        speedBytesPerSec: 0,
        createdAt: new Date().toISOString(),
      },
    ]);

    const cancelSpy = vi.spyOn(acquisitionService, 'cancelAcquisition').mockResolvedValue(true);

    render(<AcquisitionQueueDrawer isOpen={true} floatingPill={false} />);

    expect(await screen.findByText('One More Time')).toBeInTheDocument();
    expect(screen.getByText('Digital Love')).toBeInTheDocument();
    expect(screen.getByText(/1 active/i)).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();

    const cancelBtn = screen.getByTitle('Cancel download');
    fireEvent.click(cancelBtn);
    expect(cancelSpy).toHaveBeenCalledWith('job-1');
  });
});

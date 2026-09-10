import api from './api';
import type { RoomSeatingLayout } from '../constants/examRoomLayout';

export interface Room {
  _id: string;
  roomNo: string;
  roomName?: string;
  floor?: string;
  capacity: number;
  seatingLayout?: RoomSeatingLayout;
  allocatedExamDates?: string[];
  allocationOrderByDate?: Record<string, number>;
  isActive: boolean;
  assetLocationId?: string;
}

export interface AsetsExamRoomCandidate {
  locationId: string;
  roomNumber: string;
  name: string;
  className?: string;
  section?: string;
  classSection?: string;
  floor: string;
  floorName?: string;
  blockName?: string;
  path?: string;
  capacity: number;
  useForExams: boolean;
  examRoomId?: string | null;
}

export interface CBSECopyTemplateSettings {
  infoCol1Width: number;
  infoCol2Width: number;
  infoCol3Width: number;
  infoCol4Width: number;
  infoCol5Width: number;
  col1Width: number;
  col2Width: number;
  col3Width: number;
  col4Width: number;
  col5Width: number;
  col6Width: number;
  rowHeight: number;
  cellPaddingY: number;
  cellPaddingX: number;
  headerFontSize: number;
  subHeaderFontSize: number;
  bodyFontSize: number;
}

export interface MainGateTemplateSettings {
  col1Width: number;
  col2Width: number;
  col3Width: number;
  col4Width: number;
  rowHeight: number;
}

export interface RoomFolderSlipTemplateSettings {
  infoCol1Width: number;
  infoCol2Width: number;
  infoCol3Width: number;
  infoCol4Width: number;
  infoCol5Width: number;
  infoCol6Width: number;
  infoCol7Width: number;
  col1Width: number;
  col2Width: number;
  col3Width: number;
  col4Width: number;
  col5Width: number;
  col6Width: number;
  col7Width: number;
  col8Width: number;
  col9Width: number;
  rowHeight: number;
}

export interface RoomDoorSlipTemplateSettings {
  infoCol1Width: number;
  infoCol2Width: number;
  infoCol3Width: number;
  infoCol4Width: number;
  infoCol5Width: number;
  infoCol6Width: number;
  col1Width: number;
  col2Width: number;
  col3Width: number;
  rowHeight: number;
}

export interface FunctionaryDutyListFormatSettings {
  pageSize: 'A4';
  orientation: 'landscape' | 'portrait';
  columnWidths?: {
    srNo: number;
    roomNo: number;
    roomName: number;
    floor: number;
    inv1School: number;
    inv1Teacher: number;
    inv1TeacherId: number;
    inv1Signature: number;
    inv2School: number;
    inv2Teacher: number;
    inv2TeacherId: number;
    inv2Signature: number;
  };
}

export type SeatingPlanMode = 'same_across_days' | 'different_per_day';

export interface SeatingPlanTemplateSettings {
  roomAllocationMode?: 'auto' | 'manual';
  seatingPlanMode?: SeatingPlanMode;
  functionaryDutyList?: FunctionaryDutyListFormatSettings;
  mainGate: MainGateTemplateSettings;
  cbseCopy: CBSECopyTemplateSettings;
  roomFolderSlip: RoomFolderSlipTemplateSettings;
  roomDoorSlip: RoomDoorSlipTemplateSettings;
}

export const seatingPlanService = {
  // Room management
  async getRooms(): Promise<Room[]> {
    const response = await api.get('/seating-plan/rooms');
    return response.data;
  },

  async getAsetsExamRoomCandidates(): Promise<AsetsExamRoomCandidate[]> {
    const response = await api.get('/seating-plan/rooms/asets-candidates');
    return response.data;
  },

  async syncExamRoomsFromAsets(locationIds: string[]): Promise<{ message: string; data: Record<string, number> }> {
    const response = await api.post('/seating-plan/rooms/sync-from-asets', { locationIds });
    return response.data;
  },

  async createRoom(roomData: Partial<Room>): Promise<Room> {
    const response = await api.post('/seating-plan/rooms', roomData);
    return response.data;
  },

  async updateRoom(id: string, roomData: Partial<Room>): Promise<Room> {
    const response = await api.put(`/seating-plan/rooms/${id}`, roomData);
    return response.data;
  },

  async deleteRoom(id: string): Promise<void> {
    await api.delete(`/seating-plan/rooms/${id}`);
  },

  // PDF generation
  async generateMainGate(datesheetId: string): Promise<Blob> {
    const response = await api.get(`/seating-plan/generate/main-gate/${datesheetId}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async generateRoomFolderSlip(datesheetId: string): Promise<Blob> {
    const response = await api.get(`/seating-plan/generate/room-folder-slip/${datesheetId}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async generateRoomDoorSlip(datesheetId: string): Promise<Blob> {
    const response = await api.get(`/seating-plan/generate/room-door-slip/${datesheetId}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async generateCBSECopy(datesheetId: string): Promise<Blob> {
    const response = await api.get(`/seating-plan/generate/cbse-copy/${datesheetId}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async getTemplateSettings(): Promise<SeatingPlanTemplateSettings> {
    const response = await api.get('/seating-plan/template-settings');
    return response.data?.data;
  },

  async updateTemplateSettings(settings: SeatingPlanTemplateSettings): Promise<SeatingPlanTemplateSettings> {
    const response = await api.put('/seating-plan/template-settings', settings);
    return response.data?.data;
  },

  async getRoomAllocationMode(): Promise<'auto' | 'manual'> {
    const response = await api.get('/seating-plan/room-allocation-mode');
    return response.data?.data?.mode === 'manual' ? 'manual' : 'auto';
  },

  async updateRoomAllocationMode(mode: 'auto' | 'manual'): Promise<'auto' | 'manual'> {
    const response = await api.put('/seating-plan/room-allocation-mode', { mode });
    return response.data?.data?.mode === 'manual' ? 'manual' : 'auto';
  },

  async getSeatingPlanMode(): Promise<SeatingPlanMode> {
    const response = await api.get('/seating-plan/seating-plan-mode');
    return response.data?.data?.mode === 'same_across_days' ? 'same_across_days' : 'different_per_day';
  },

  async updateSeatingPlanMode(mode: SeatingPlanMode): Promise<SeatingPlanMode> {
    const response = await api.put('/seating-plan/seating-plan-mode', { mode });
    return response.data?.data?.mode === 'same_across_days' ? 'same_across_days' : 'different_per_day';
  },

  // Helper to download PDF
  downloadPDF(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

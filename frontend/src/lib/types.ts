export type Role = 'admin' | 'faculty' | 'student';
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export type Kind = 'lab' | 'classroom' | 'hall' | 'equipment' | 'other';

export interface User {
  id: number; fullName: string; email: string; memberId: string; phone: string | null; status: 'active' | 'suspended';
  role: Role; departmentId: number | null; departmentName: string | null; departmentCode?: string | null;
  lastLoginAt: string | null; createdAt: string; bookingCount?: number;
}
export interface Resource {
  id: number; code: string; name: string; description: string | null; capacity: number; status: 'available' | 'maintenance' | 'retired';
  requiresApproval: boolean; categoryId: number; categoryName: string; categoryKind: Kind; categoryIcon: string;
  roomId: number; roomNumber: string; floorNo: number; buildingId: number; buildingName: string; buildingCode: string;
  departmentId: number | null; departmentName: string | null; equipmentCount: number; upcomingBookings: number; createdAt: string;
}
export interface EquipmentItem { id: number; name: string; assetTag: string; quantityTotal: number; status: string; bookableAddon: boolean }
export interface EquipmentRow extends EquipmentItem { resourceId: number; resourceName: string; resourceCode: string; createdAt: string }
export interface ResourceDetail extends Omit<Resource, 'upcomingBookings'> {
  upcomingBookings: Array<{ id: number; startTime: string; endTime: string; status: string; mine: boolean }>;
  equipment: EquipmentItem[];
  schedules: Array<{ id: number; courseCode: string; courseName: string; semester: string; dayOfWeek: number; startTime: string; endTime: string }>;
  maintenance: Array<{ id: number; title: string; status: string; priority: string; startsAt: string; expectedEnd: string | null }>;
}
export interface Booking {
  id: number; bookingCode: string; status: BookingStatus; startTime: string; endTime: string; purpose: string; attendees: number;
  cancelReason: string | null; createdAt: string; hours: number; userId: number; userName: string; userEmail: string; userRole: Role;
  departmentName: string | null; resourceId: number; resourceCode: string; resourceName: string; categoryName: string; categoryKind: Kind;
  roomNumber: string; buildingName: string; buildingCode: string; decision: string | null; decisionRemarks: string | null;
  decidedAt: string | null; decidedByName: string | null; isFuture?: number;
}
export interface BookingDetail extends Booking {
  equipment: Array<{ id: number; name: string; assetTag: string; quantity: number }>;
  history: Array<{ id: number; oldStatus: string | null; newStatus: string; changedAt: string; changedByName: string | null }>;
  canEdit: boolean; canCancel: boolean; canDecide: boolean;
}
export interface ScheduleEvent { id: string; type: 'booking' | 'class' | 'maintenance'; title: string; start: string; end: string; status?: string; mine?: boolean; bookingId?: number }
export interface Notice { id: number; type: string; title: string; message: string; bookingId: number | null; maintenanceId: number | null; isRead: boolean; createdAt: string }
export interface Maintenance {
  id: number; resourceId: number; title: string; description: string | null; priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'reported' | 'open' | 'in_progress' | 'resolved' | 'closed'; startsAt: string; expectedEnd: string | null; resolvedAt: string | null;
  createdAt: string; reportedBy: number | null; assignedTo: number | null; resourceName: string; resourceCode: string;
  reportedByName: string | null; assignedToName: string | null; cancelledBookings?: number;
}
export interface Lookups {
  categories: Array<{ id: number; name: string; kind: Kind; icon: string }>;
  buildings: Array<{ id: number; code: string; name: string; totalFloors: number }>;
  rooms: Array<{ id: number; buildingId: number; roomNumber: string; floorNo: number; capacity: number }>;
  departments: Array<{ id: number; code: string; name: string }>;
}
export interface Meta { page: number; limit: number; total: number; totalPages: number; [k: string]: unknown }

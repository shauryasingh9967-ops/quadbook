import { Box, Camera, Cpu, FlaskConical, Landmark, Mic, Monitor, Presentation, Users, type LucideIcon } from 'lucide-react';
const map: Record<string, LucideIcon> = { monitor: Monitor, cpu: Cpu, 'flask-conical': FlaskConical, presentation: Presentation, users: Users, mic: Mic, landmark: Landmark, camera: Camera, box: Box };
export const categoryIcon = (name: string): LucideIcon => map[name] ?? Box;

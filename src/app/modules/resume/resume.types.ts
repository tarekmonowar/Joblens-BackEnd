export interface IResumeJson {
  name: string;
  title: string;
  contact: string[];
  summary: string;
  skills: string[];
  experience: {
    role: string;
    company: string;
    period: string;
    bullets: string[];
  }[];
  projects: {
    name: string;
    description: string;
    bullets: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    period: string;
  }[];
  certifications: string[];
}

export interface IJobRequirements {
  title: string;
  company: string;
  skills: string[];
  description: string;
}

export interface ICustomizedResume {
  fileName: string;
  pdfBase64: string;
}

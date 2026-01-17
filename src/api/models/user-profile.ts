export interface UserProfile {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  company: string | null;
  office: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  mobile: string | null;
  phone: string | null;
  hireDate: string | null;
  manager: {
    name: string;
    email: string;
    jobTitle: string | null;
  } | null;
}

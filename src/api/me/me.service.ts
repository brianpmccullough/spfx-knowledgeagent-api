import { Injectable } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import { UserProfile } from '../models/user-profile';

@Injectable()
export class MeService {
  async getProfile(graphClient: Client): Promise<UserProfile> {
    const user = await graphClient
      .api('/me')
      .select([
        'displayName',
        'givenName',
        'surname',
        'mail',
        'userPrincipalName',
        'jobTitle',
        'department',
        'companyName',
        'officeLocation',
        'city',
        'state',
        'country',
        'mobilePhone',
        'businessPhones',
        'employeeHireDate',
      ])
      .get();

    let manager = null;
    try {
      const managerData = await graphClient
        .api('/me/manager')
        .select(['displayName', 'mail', 'jobTitle'])
        .get();
      manager = {
        name: managerData.displayName,
        email: managerData.mail,
        jobTitle: managerData.jobTitle,
      };
    } catch {}

    return {
      name: user.displayName,
      firstName: user.givenName,
      lastName: user.surname,
      email: user.mail || user.userPrincipalName,
      jobTitle: user.jobTitle || null,
      department: user.department || null,
      company: user.companyName || null,
      office: user.officeLocation || null,
      city: user.city || null,
      state: user.state || null,
      country: user.country || null,
      mobile: user.mobilePhone || null,
      phone: user.businessPhones?.[0] || null,
      hireDate: user.employeeHireDate || null,
      yearsOfService: user.employeeHireDate
        ? Math.floor(
            (Date.now() - new Date(user.employeeHireDate).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null,
      manager,
    };
  }
}

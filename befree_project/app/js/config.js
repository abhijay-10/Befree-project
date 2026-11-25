// Settings shared by the Befree widgets. Change names and lists here, not in the other files.
(function (root) {
  const C = {
    // 'auto': live data inside Zoho CRM, sample data in a normal browser tab.
    // 'demo': always sample data, even inside CRM.
    mode: 'auto',

    // CRM module API names
    modules: { contact: 'Contacts', account: 'Accounts', deal: 'Deals', touch: 'Touches', task: 'Tasks', meeting: 'Events' },

    // LEADS MODULE: field API names taken from your CRM.
    // '' means the field does not exist yet. The widget then shows "Not set up yet" for that part.
    lead: {
      firstName: 'First_Name', lastName: 'Last_Name', title: 'Designation', email: 'Email', company: 'Company',
      country: 'Country', staff: 'No_of_Employees', owner: 'Owner', status: 'Lead_Status',
      optedOut: 'Email_Opt_Out', convertedDeal: 'Converted_Deal',
      phone: 'Phone', mobile: 'Mobile', source: 'Lead_Source', industry: 'Industry', rating: 'Rating', website: 'Website', city: 'City',
      // API name of the service field. If '', the widget looks for a field labelled Service, Services or Service Line
      service: 'Services_List',
      lifecycle: '', backToColdOn: '',
      // Touches: fill both once the module exists and has a lookup to Leads
      touchModule: '', touchLookup: '',
      // Custom fields on Meetings (Events) and Tasks
      selfBooked: '', outcome: '', reason: '', reschedules: '', taskType: ''
    },
    // AI summary: API name of the CRM function that calls OpenAI (see crm_functions/lead_ai_summary.dg)
    // savedField: Leads field that keeps the last summary (Multi Line, Large). Without it, summaries are kept in the browser only.
    ai: { functionName: 'lead_ai_summary', savedField: 'AI_Summary_Data' },
    // Duplicate alert: these email domains do not identify a company
    freeMail: ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.com.au', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'bigpond.com', 'zoho.com', 'zohomail.com'],
    closedTaskStatus: ['Completed', 'Done', 'Cancelled'],

    // CONTACTS MODULE: suggested API names, not confirmed. Confirm these in Setup > Developer Hub > APIs & SDKs > API Names.
    fields: {
      contact: {
        name: 'Full_Name', title: 'Title', email: 'Email', account: 'Account_Name',
        lifecycle: 'Lifecycle_Stage', optedOut: 'Email_Opt_Out', backToColdOn: 'Back_To_Cold_On'
      },
      account: { name: 'Account_Name', country: 'Country', staff: 'Employees', owner: 'Owner' },
      touch: { contact: 'Contact', account: 'Account', type: 'Touch_Type', channel: 'Channel', date: 'Touch_Date' },
      task: { contact: 'Who_Id', subject: 'Subject', type: 'Task_Type', owner: 'Owner', due: 'Due_Date', status: 'Status' },
      meeting: {
        contact: 'Who_Id', title: 'Event_Title', start: 'Start_DateTime', end: 'End_DateTime',
        selfBooked: 'Self_Booked', outcome: 'Meeting_Outcome', reason: 'Reject_Reason', reschedules: 'Reschedule_Count'
      },
      deal: { name: 'Deal_Name', account: 'Account_Name', stage: 'Stage', createdBy: 'Created_By' }
    },

    // CRM profile name -> Befree role. Any other profile is view only.
    profiles: { Administrator: 'Admin', Admin: 'Admin', RevOps: 'Admin', BDM: 'BDM', BDE: 'BDE', Marketing: 'Marketing' },

    // R8a
    users: [
      { id: 'revops', name: 'RevOps', role: 'Admin', country: null },
      { id: 'sam', name: 'Sam', role: 'BDM', country: 'UK' },
      { id: 'tina', name: 'Tina', role: 'BDE', country: 'UK' },
      { id: 'brad', name: 'Brad', role: 'BDM', country: 'US' },
      { id: 'cooper', name: 'Cooper', role: 'BDE', country: 'US' },
      { id: 'ross', name: 'Ross', role: 'BDM', country: 'AU' },
      { id: 'rick', name: 'Rick', role: 'BDE', country: 'AU' },
      { id: 'marketing', name: 'Marketing', role: 'Marketing', country: null }
    ],

    // R2
    stages: { 'Qualified': 10, 'Needs confirmed': 25, 'Proposal presented': 50, 'Agreement sent': 75, 'Verbal commitment': 90, 'Closed-won': 100, 'Closed-lost': 0 },

    // R5
    highIntentTypes: ['Pricing page', 'Offer request', 'Meeting request', 'Self-booked meeting'],
    warmDays: 30,
    hotDays: 30, // ASSUMPTION: the brief gives no time limit for Hot

    // R4
    outcomes: ['Accepted', 'Rejected', 'No-show'],
    maxReschedules: 2,
    serviceLines: ['Service line A', 'Service line B', 'Service line C'], // R9 PLACEHOLDER, sample data only
    rejectReasons: ['Not a fit', 'No need', 'Wrong contact', 'Other'] // R9 PLACEHOLDER
  };
  if (typeof module !== 'undefined') module.exports = C; else root.BefreeConfig = C;
})(this);

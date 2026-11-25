// Settings for the Befree Deal widget. Change names and lists here, not in the other files.
(function (root) {
  const C = {
    // 'auto': live data inside Zoho CRM, sample data in a normal browser tab.
    // 'demo': always sample data, even inside CRM.
    mode: 'auto',

    // DEALS MODULE: field API names taken from your CRM
    deal: {
      name: 'Deal_Name', account: 'Account_Name', contact: 'Contact_Name', owner: 'Owner', createdBy: 'Created_By',
      amount: 'Amount', expected: 'Expected_Revenue', stage: 'Stage', probability: 'Probability', closeDate: 'Closing_Date',
      nextStep: 'Next_Step', lostReason: 'Reason_For_Loss__s', service: 'Services_List',
      type: 'Type', leadSource: 'Lead_Source', campaign: 'Campaign_Source', description: 'Description'
    },

    // ASSUMPTION: there is no timeline field in Deals, so the closing date is used as the timeline
    timeline: 'Closing_Date',

    // Not in your Deals list yet. '' means "Not set up yet" in the widget. Fill in the API name once created.
    extra: {
      sourcedBy: '',       // pick list: BDE, BDM, Marketing, Referral, AI SDR
      nextStepUpdated: '', // date: when Next Step was last changed or cleared
      approval: '',        // pick list: Not needed, Pending, Approved, Rejected
      acceptance: '',      // pick list: Not needed, Pending, Accepted, Rejected
      rejectReason: '',    // pick list
      // Touches module with a lookup to Accounts
      touchModule: '', touchAccount: '', touchType: '', touchChannel: '', touchDate: ''
    },

    // Contact role ID -> role name. Only needed if CRM gives the widget an ID it cannot look up.
    // Example: '1234567890': 'Decision Maker'
    contactRoles: {},

    // Stage ID -> stage name, for the stage history. Only used if CRM does not give the name itself.
    // Read from the history of a deal that went through all 7 stages in order.
    stageIds: {
      '1485773000000000245': 'Qualification', '1485773000000000247': 'Needs Analysis', '1485773000000000249': 'Value Proposition', '1485773000000000251': 'Id. Decision Makers',
      '1485773000000000253': 'Proposal/Price Quote', '1485773000000000255': 'Negotiation/Review', '1485773000000000257': 'Closed Won'
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

    // R2. Stage names are compared without spaces, hyphens or capitals.
    stages: [
      { name: 'Qualified', prob: 10 }, { name: 'Needs confirmed', prob: 25 }, { name: 'Proposal presented', prob: 50 },
      { name: 'Agreement sent', prob: 75 }, { name: 'Verbal commitment', prob: 90 }, { name: 'Closed-won', prob: 100 }, { name: 'Closed-lost', prob: 0 }
    ],

    // R9 PLACEHOLDERS, used for sample data and for rejecting a deal
    rejectReasons: ['Not a fit', 'No need', 'Wrong contact', 'Other'],
    sampleLostReasons: ['Price', 'Competitor', 'No decision', 'Timing', 'Other'],
    sampleServices: ['Accounting Services', 'Payroll Services', 'Virtual Admin Services', 'Bookkeeping Services', 'Tax Services'],

    // Writing the next stage as the Next step moves the deal there.
    // true: only when qualification is complete, as Befree's rules require (R3, step 7). false: without that check.
    nextStepNeedsQualification: true,

    approvalMonths: 3,      // step 7
    ownerAlertDays: 2,      // step 8
    managerAlertDays: 7,    // step 8
    maxPushes: 2,           // step 8
    influencedDays: 180,    // R6
    lockServicesAt: 90      // services cannot be changed from this probability (Negotiation) on
  };
  if (typeof module !== 'undefined') module.exports = C; else root.BefreeConfig = C;
})(this);

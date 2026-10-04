// FIXTURES, NOT LIVE CAPTURES. Hand-written from the documented shape of the NHTSA vPIC DecodeVinValues and
// Recalls-by-vehicle responses (as remembered when this was written). No NHTSA request was made to produce them.
// If NHTSA changes its format, the parsers (services/nhtsaCore.ts) must still degrade gracefully - see the tests.
export const DECODE_OK = {
  Count: 1, Message: 'Results returned successfully. NOTE: Any missing decoded values should be interpreted as NHTSA does not have data on the specific variable.',
  SearchCriteria: 'VIN(s): 2HGFC2F69KH500000',
  Results: [{
    Make: 'HONDA', Manufacturer: 'HONDA DEVELOPMENT & MANUFACTURING OF AMERICA, LLC', Model: 'Civic', ModelYear: '2019', Series: 'Sedan', Trim: 'EX',
    BodyClass: 'Sedan/Saloon', DriveType: 'FWD/Front-Wheel Drive', FuelTypePrimary: 'Gasoline', DisplacementL: '2.0', EngineCylinders: '4', EngineHP: '158', Turbo: '',
    VehicleType: 'PASSENGER CAR', PlantCountry: 'UNITED STATES (USA)', ErrorCode: '0', ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
    TransmissionStyle: '', Doors: '4', AirBagLocFront: '1st Row (Driver and Passenger)',
  }],
};
export const DECODE_CHECKDIGIT_AND_PARTIAL = {
  Count: 1, Message: 'Results returned successfully.', SearchCriteria: 'VIN(s): 1FTEW1EP5KFA00000',
  Results: [{ Make: 'FORD', Model: 'F-150', ModelYear: '2019', Trim: '', Series: 'XLT', DisplacementL: '2.7', EngineCylinders: '6', Turbo: 'Yes', EngineHP: '325', DriveType: '4WD/4-Wheel Drive/4x4', BodyClass: 'Pickup', FuelTypePrimary: 'Gasoline', ErrorCode: '1,6', ErrorText: '1 - Check Digit (9th position) does not calculate properly; 6 - Incomplete VIN' }],
};
export const DECODE_GARBAGE = {
  Count: 1, Message: 'Results returned successfully.', SearchCriteria: 'VIN(s): 11111111111111111',
  Results: [{ Make: '', Model: '', ModelYear: '', ErrorCode: '8', ErrorText: '8 - No detailed data available currently' }],
};
export const RECALLS_OK = {
  Count: 2, Message: 'Results returned successfully',
  results: [
    { Manufacturer: 'Honda (American Honda Motor Co.)', NHTSACampaignNumber: '20V314000', parkIt: false, parkOutSide: false, overTheAirUpdate: false, ReportReceivedDate: '07/09/2020', Component: 'FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP', Summary: 'Honda is recalling certain vehicles. The low-pressure fuel pump may fail.', Consequence: 'A fuel pump failure can cause the engine to stall, increasing the risk of a crash.', Remedy: 'Dealers will replace the low-pressure fuel pump, free of charge.', Notes: '', ModelYear: '2019', Make: 'HONDA', Model: 'CIVIC' },
    { Manufacturer: 'Honda (American Honda Motor Co.)', NHTSACampaignNumber: '20V314000', Component: 'DUPLICATE ROW', ModelYear: '2019', Make: 'HONDA', Model: 'CIVIC' },
    { Manufacturer: 'Honda', NHTSACampaignNumber: '21V215000', parkIt: true, Component: 'AIR BAGS', Summary: 'Passenger frontal air bag may not deploy.', Consequence: 'Increased risk of injury.', Remedy: 'Dealers will inspect and replace the inflator.', ReportReceivedDate: '03/30/2021' },
    { NHTSACampaignNumber: '', Component: 'NO CAMPAIGN NUMBER - skipped' },
    null,
  ],
};
export const RECALLS_NONE = { Count: 0, Message: 'Results returned successfully', results: [] };

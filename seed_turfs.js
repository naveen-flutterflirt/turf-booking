const db = require('./src/config/db');

const seedTurfs = async () => {
  const query = `
    INSERT INTO turfs (
      owner_id,
      name,
      description,
      address,
      city,
      state,
      pincode,
      latitude,
      longitude,
      price_per_hour,
      opening_time,
      closing_time,
      status,
      is_open,
      is_featured
    ) VALUES
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 1',
      'Premium football turf with quality artificial grass.',
      'Vijay Nagar',
      'Indore',
      'Madhya Pradesh',
      '452010',
      22.7533,
      75.8937,
      800.00,
      '06:00:00',
      '23:00:00',
      'APPROVED',
      TRUE,
      TRUE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 2',
      'Well-maintained football turf suitable for 5-a-side matches.',
      'Scheme No. 78',
      'Indore',
      'Madhya Pradesh',
      '452010',
      22.7510,
      75.9050,
      700.00,
      '06:00:00',
      '23:00:00',
      'APPROVED',
      TRUE,
      FALSE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 3',
      'Spacious turf with excellent lighting for night games.',
      'Palasia',
      'Indore',
      'Madhya Pradesh',
      '452001',
      22.7275,
      75.8790,
      900.00,
      '06:00:00',
      '23:30:00',
      'APPROVED',
      TRUE,
      TRUE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 4',
      'Affordable football turf for regular matches and practice.',
      'Rau',
      'Indore',
      'Madhya Pradesh',
      '453331',
      22.6390,
      75.8060,
      600.00,
      '06:00:00',
      '22:00:00',
      'APPROVED',
      TRUE,
      FALSE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 5',
      'Professional-grade turf with floodlights and changing rooms.',
      'Bhawarkuan',
      'Indore',
      'Madhya Pradesh',
      '452014',
      22.6820,
      75.8570,
      850.00,
      '06:00:00',
      '23:00:00',
      'APPROVED',
      TRUE,
      FALSE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 6',
      'Modern indoor football turf suitable for evening matches.',
      'LIG Colony',
      'Indore',
      'Madhya Pradesh',
      '452008',
      22.7310,
      75.8795,
      750.00,
      '07:00:00',
      '23:00:00',
      'APPROVED',
      TRUE,
      FALSE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 7',
      'Premium turf facility with parking and changing facilities.',
      'Rau Main Road',
      'Indore',
      'Madhya Pradesh',
      '453331',
      22.6500,
      75.8150,
      950.00,
      '06:00:00',
      '23:30:00',
      'APPROVED',
      TRUE,
      TRUE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 8',
      'Comfortable football turf for friends, teams and tournaments.',
      'MR 10 Road',
      'Indore',
      'Madhya Pradesh',
      '452016',
      22.7530,
      75.9250,
      700.00,
      '06:00:00',
      '22:30:00',
      'APPROVED',
      TRUE,
      FALSE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 9',
      'High-quality artificial turf with professional floodlighting.',
      'Super Corridor',
      'Indore',
      'Madhya Pradesh',
      '453555',
      22.7280,
      75.8040,
      850.00,
      '06:00:00',
      '23:00:00',
      'APPROVED',
      TRUE,
      FALSE
    ),
    (
      '543a1560-0691-410d-9338-441822d292d0',
      'Turf Arena 10',
      'Large football turf ideal for tournaments and group bookings.',
      'Rau Bypass',
      'Indore',
      'Madhya Pradesh',
      '453331',
      22.6250,
      75.7900,
      1000.00,
      '06:00:00',
      '23:30:00',
      'APPROVED',
      TRUE,
      TRUE
    );
  `;

  try {
    console.log('Inserting dummy turfs...');
    await db.query(query);
    console.log('Successfully inserted turfs data!');
  } catch (err) {
    console.error('Error inserting turfs:', err);
  } finally {
    db.pool.end();
  }
};

seedTurfs();

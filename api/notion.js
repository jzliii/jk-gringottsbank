// api/notion.js
// 使用純 CommonJS 語法，支援同步結算紀錄與跨裝置設定雲端備份/載入功能。

module.exports = async function handler(req, res) {
  // 1. 限制只允許 POST 請求
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { token, databaseId, record, action, stateStr } = req.body;

    if (!token || !databaseId) {
      return res.status(400).json({ error: '缺少必要的連線金鑰 (token 或 databaseId)' });
    }

    // 依據 action 執行不同功能，預設為舊有的同步單筆紀錄 (sync_record)
    const currentAction = action || 'sync_record';

    // ==========================================
    // 功能 A: 備份設定至 Notion (save_state)
    // ==========================================
    if (currentAction === 'save_state') {
      if (!stateStr) {
        return res.status(400).json({ error: '缺少要備份的設定資料 (stateStr)' });
      }

      // 先查詢資料庫是否已存在 "SYSTEM_STATE" 的備份頁面
      const queryResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            property: 'Name',
            title: {
              equals: 'SYSTEM_STATE'
            }
          }
        })
      });

      const queryData = await queryResponse.json();
      if (!queryResponse.ok) {
        return res.status(queryResponse.status).json({ error: '查詢舊備份失敗', details: queryData });
      }

      const existingPage = queryData.results && queryData.results[0];

      if (existingPage) {
        // 若已存在，則進行更新 (PATCH)
        const updateResponse = await fetch(`https://api.notion.com/v1/pages/${existingPage.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            properties: {
              Note: {
                rich_text: [{ text: { content: stateStr } }]
              }
            }
          })
        });

        const updateData = await updateResponse.json();
        if (updateResponse.ok) {
          return res.status(200).json({ success: true, updated: true, data: updateData });
        } else {
          return res.status(updateResponse.status).json({ error: '更新雲端備份失敗', details: updateData });
        }
      } else {
        // 若不存在，則建立新頁面 (POST)
        const createResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parent: { database_id: databaseId },
            properties: {
              Name: {
                title: [{ text: { content: "SYSTEM_STATE" } }]
              },
              Note: {
                rich_text: [{ text: { content: stateStr } }]
              },
              Category: {
                select: { name: "其他" }
              }
            }
          })
        });

        const createData = await createResponse.json();
        if (createResponse.ok) {
          return res.status(200).json({ success: true, created: true, data: createData });
        } else {
          return res.status(createResponse.status).json({ error: '建立雲端備份失敗', details: createData });
        }
      }
    }

    // ==========================================
    // 功能 B: 從 Notion 載入設定 (load_state)
    // ==========================================
    if (currentAction === 'load_state') {
      const queryResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            property: 'Name',
            title: {
              equals: 'SYSTEM_STATE'
            }
          }
        })
      });

      const queryData = await queryResponse.json();
      if (!queryResponse.ok) {
        return res.status(queryResponse.status).json({ error: '讀取雲端備份失敗', details: queryData });
      }

      const existingPage = queryData.results && queryData.results[0];
      if (existingPage) {
        const stateStr = existingPage.properties?.Note?.rich_text?.[0]?.plain_text || '';
        return res.status(200).json({ success: true, stateStr });
      } else {
        return res.status(200).json({ success: true, stateStr: null });
      }
    }

    // ==========================================
    // 功能 C: 原有功能 - 同步單筆月底結算紀錄 (sync_record)
    // ==========================================
    if (!record) {
      return res.status(400).json({ error: '缺少要同步的結算紀錄 (record)' });
    }

    const notionBody = {
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: `${record.category} ${record.key}` } }]
        },
        Month: {
          rich_text: [{ text: { content: String(record.key) } }]
        },
        Category: {
          select: { name: record.category }
        },
        Amount: {
          number: Number(record.amount) || 0
        },
        Note: {
          rich_text: [{ text: { content: record.note || "" } }]
        },
        Source: {
          select: { name: "JZ Gringotts Bank" } }
        }
      }
    };

    const notionResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notionBody)
    });

    const data = await notionResponse.json();

    if (!notionResponse.ok) {
      return res.status(notionResponse.status).json({
        error: 'Notion API 錯誤',
        details: data
      });
    }

    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Notion Proxy 發生錯誤:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
